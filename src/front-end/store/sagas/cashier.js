import { select, call, put } from 'redux-saga/effects';

import moment from 'moment';
import 'moment/locale/pt-br';

import { CASHIER_OPERATIONS } from '../../screens/cashier/components/current-cashier/components/cashier-open/components/top-buttons-values/dialog-config';
import { CREATE_CASHIER, UPDATE_CASHIER, READ_CASHIERS } from '../../../back-end/events-handlers/cashier/types';
import { calculateTotalProfit, parseSaleTableItem } from '../../screens/cashier/cashier-utils';
import { Creators as CashierCreators } from '../ducks/cashier';
import { CASHIER } from '../../../common/entitiesTypes';
import execRequest from './execRequest';

const EVENT_TAGS = {
  READ_ALL_CASHIERS: 'CASHIERS_READ',
  CREATE_CASHIER: 'CASHIER_CREATE',
  UPDATE_CASHIER: 'CASHIER_UPDATE',
};

export function* createCashier(action) {
  try {
    moment.locale('pt-br');

    const { username } = yield select(state => state.auth.user);
    const { args } = action;

    const initialCashier = {
      initialMoneyCashier: parseFloat(args),
      timestampText: moment().calendar(),
      dateToShow: moment().format('LL'),
      totalOutcome: parseFloat(0),
      totalIncome: parseFloat(0),
      totalProfit: parseFloat(0),
      openBy: username,
      closedBy: '-',
      operations: '',
    };

    const result = yield call(execRequest, CASHIER, CREATE_CASHIER, EVENT_TAGS.CREATE_CASHIER, initialCashier);

    const newCashier = {
      ...initialCashier,
      operations: [],
      id: result,
    };

    yield put(CashierCreators.createCashierSuccess(newCashier));
  } catch (err) {
    yield put(CashierCreators.createCashierFailure(err.message));
  }
}

export function* getAllCashiers() {
  try {
    const result = yield call(execRequest, CASHIER, READ_CASHIERS, EVENT_TAGS.READ_ALL_CASHIERS);

    yield put(CashierCreators.getAllCashiersSuccess(result));
  } catch (err) {
    yield put(CashierCreators.getAllCashiersFailure());
  }
}

export function* editCashier(action) {
  try {
    const { cashier } = action.payload;

    const cashierUpdated = {
      ...cashier,
      operations: JSON.stringify(cashier.operations),
      totalOutcome: parseFloat(cashier.totalOutcome),
      totalIncome: parseFloat(cashier.totalIncome),
      totalProfit: parseFloat(cashier.totalProfit),
    };

    yield call(execRequest, CASHIER, UPDATE_CASHIER, EVENT_TAGS.UPDATE_CASHIER, cashierUpdated);
    yield put(CashierCreators.editCashierSuccess(cashierUpdated));
  } catch (err) {
    yield put(CashierCreators.editCashierFailure(err.message));
  }
}

export function* closeCashier() {
  const { cashier, auth } = yield select(state => state);

  const data = {
    payload: {
      cashier: {
        ...cashier.currentCashier,
        closedBy: auth.user.username,
      },
    },
  };

  yield call(editCashier, data);
}

const checkIsOperationTypeSale = ({ type }) => (type === CASHIER_OPERATIONS.SALE || type === CASHIER_OPERATIONS.CONSOLIDATE_BUDGET_PAYMENT);

const getTotalProfit = (operations) => {
  const saleOperations = operations.filter(operation => checkIsOperationTypeSale(operation));

  const totalProfit = calculateTotalProfit(saleOperations);

  return totalProfit;
};

export function* onAddSaleOperation(newSale) {
  const { currentCashier } = yield select(state => state.cashier);
  const { operations } = currentCashier;

  const saleParsedToTableView = parseSaleTableItem(newSale);
  const operationsUpdated = [saleParsedToTableView, ...operations];
  const totalProfit = getTotalProfit(operationsUpdated);

  const payload = {
    cashier: {
      ...currentCashier,
      operations: operationsUpdated,
      totalProfit,
    },
  };

  yield call(editCashier, { payload });
}

const getCashierOperations = (operations) => {
  let cashierOperations = [];

  if (typeof operations === 'string' && !!operations) {
    cashierOperations = JSON.parse(operations);
  }

  if (Array.isArray(operations)) {
    cashierOperations = operations;
  }

  return cashierOperations;
};

const checkIsSaleBelongsToCashier = (cashier, sale) => {
  const { operations } = cashier;

  const cashierOperations = getCashierOperations(operations);

  return cashierOperations.some(saleOperation => checkIsOperationTypeSale(saleOperation) && (saleOperation.id === sale.id));
};

export function* onEditSaleOperation(saleUpdated) {
  const { currentCashier, pastCashiers } = yield select(state => state.cashier);

  const cashiers = [currentCashier, ...pastCashiers];
  const cashierOwnerSale = cashiers.find(cashier => checkIsSaleBelongsToCashier(cashier, saleUpdated));
  const cashierOwnerSaleOperations = getCashierOperations(cashierOwnerSale.operations);

  const cashierOwnerOperationsUpdated = cashierOwnerSaleOperations.map((operation) => {
    const isSaleUpdated = checkIsOperationTypeSale(operation) && (operation.id === saleUpdated.id);

    return (isSaleUpdated ? parseSaleTableItem(saleUpdated) : operation);
  });

  const totalProfit = getTotalProfit(getCashierOperations(cashierOwnerOperationsUpdated));

  const payload = {
    cashier: {
      ...cashierOwnerSale,
      operations: cashierOwnerOperationsUpdated,
      totalProfit,
    },
  };

  yield call(editCashier, { payload });
}
