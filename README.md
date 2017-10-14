# redux-repeat

## Overview
The goal of this idea is to make async actions as easy to work with as sync actions in redux. It does this by taking a similar approach to redux-saga, but with a focus on testability.

## Motivation
redux-saga is a beautiful approach to handling async effects in redux. It allows one to keep all their actions serializable, and to write async flows easily using generators. It has a few glaring deficiencies though:

* It's opaque. The state of the system is held in an opaque object that runs alongside your store, and changes to it happen silently.
* It's complex. There is a wealth of primitive effects supported by the system, which makes it hard to write implementations of saga runners, which makes testing by replacing the saga runtime infeasible.
* It's difficult to test. The redux-saga documentation shows how to effectively test the implementation of your sagas, rather than the behaviour. If you are willing to write an extremely low-level test against a single saga, then your test can be deterministic, but if you want to test the behaviour of multiple sagas composed together, your test becomes undeterministic, and the use of timeouts is required to know when things "settle down".

By only supporting promises, and allowing users to name their promises, testing complex async flows that involve multiple sagas deterministically becomes trivial. It also has the side effect of reifying the current async state, meaning that it can live alongside the rest of your application state with all the benefits that entails.

## Design
Similar to redux-saga but lighter. Generators that have access to the store and that yield promises. The differences are:

* Smaller API. Sagas can be injected with dispatch and getStore() directly. Yielding is only used for promise resolution.
* Sagas are named, as are requests to resolve promises
* The state of the system is kept in redux
* Listening for actions is declarative and based purely on type matching (like http routing)

```javascript
const routes = [
  ["FETCH_USER", fetchUserSaga],  // name of the saga is FETCH_USER
  ["FETCH_USER", "FETCH_USER_2", watchFetchUsers]  // name of the saga is FETCH_USER_2
];

const api = {fetch};

const routes = (api) => new SagaRoutes()
  .takeEvery("FETCH_USER", fetchUserSaga, api)  // api is passed as the first argument to the saga
  .takeLast("UPDATE_AUTOCOMPLETE", fetchAutocompletionsSaga, api)
  .build();

function* fetchUserSaga(api, action, dispatch, getState) {
  dispatch(fetchUserStart());
  const [userData, err] = yield ['fetch-user', api.fetch('/some/url')]
  if (err != null) {
    dispatch(fetchUserDone(userData));
  } else {
    dispatch(displayError(err));
  }
}

const sagaMiddleware = makeSagaMiddleware(routes, api);
const store = createStore(reducer, sagaMiddleware);
const App = props => <Provider store={store}><MainPage /></Provider>;


// Testing

// Dispatch a regular action, which triggers a saga that starts an async action.
store.dispatch(initialFetch());
// Regular assertion against state.
expect(getLoadingStatus(store.getState())).toBe(true);
// Resolve pending promises by name, no mocks or plumbing.
sagaMiddleware.resolve('initial-fetch', fakeFetchData);
expect(getLoadingStatus(store.getState())).toBe(false);
```
