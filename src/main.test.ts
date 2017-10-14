import { Dispatch, Store, applyMiddleware, createStore } from "redux";
import { Effect, RouteBuilder, add, makeSagaMiddleware, reducer } from "./main";

// Saga that waits in the "wait" state, then dispatches either onSuccess or
// onError, depending on whether the thread was errored or not.
const waitThenDispatch = <S>(onSuccess: string, onError: string) =>
  function*(
    dispatch: Dispatch<S>,
    getState: () => S
  ): IterableIterator<Effect> {
    try {
      const result = yield ["wait", null, null, null];
      dispatch({ type: onSuccess });
    } catch (e) {
      dispatch({ type: onError });
    }
  };

// Saga that waits in the "wait" state, then dispatches onTrue or onFalse,
// depending on what "wait" yields.
const ifTrueAElseB = <S>(onTrue: string, onFalse: string) =>
  function*(
    dispatch: Dispatch<S>,
    getState: () => S
  ): IterableIterator<Effect> {
    const result = yield ["wait", null, null, null];
    if (result) {
      dispatch({ type: onTrue });
    } else {
      dispatch({ type: onFalse });
    }
  };

// Consumes N messages in the "wait" state, then waits in the "end" state.
const waitNTimes = <S>(n: number) =>
  function*(
    dispatch: Dispatch<S>,
    getState: () => S
  ): IterableIterator<Effect> {
    for (let i = 0; i < n; i++) {
      const result = yield ["wait", null, null, null];
      dispatch({ type: "wait-" + i });
    }
    const result = yield ["end", null, null, null];
    dispatch({ type: "done" });
  };

// Repeatedly blocks in the "wait" state until it yields true.
const waitUntilTrue = function*<S>(
  dispatch: Dispatch<S>,
  getState: () => S
): IterableIterator<Effect> {
  while (true) {
    const result = yield ["wait", null, null, null];
    if (result) {
      break;
    }
    dispatch({ type: "looping" });
  }
  dispatch({ type: "done" });
};

describe("simple-case", () => {
  let routes: RouteBuilder;
  let store: Store<String>;

  beforeEach(() => {
    routes = new RouteBuilder().takeEvery(
      "A",
      "A",
      waitThenDispatch("SUCCESS", "ERROR")
    );
    store = createStore<string>(
      reducer,
      applyMiddleware(makeSagaMiddleware(routes))
    );
  });

  it("starts in a consistent state", () => {
    expect(store.getState()).toBe("@@redux/INIT");
  });

  it("continues", () => {
    store.dispatch({ type: "A" });
    expect(store.getState()).toBe("A");
    routes.continueThread("A", "wait", 100);
    expect(store.getState()).toBe("SUCCESS");
  });

  it("errors", () => {
    store.dispatch({ type: "A" });
    expect(store.getState()).toBe("A");
    routes.errorThread("A", "wait", 100);
    expect(store.getState()).toBe("ERROR");
  });
});

describe("dynamic-looping-case", () => {
  let routes: RouteBuilder;
  let store: Store<String>;

  beforeEach(() => {
    routes = new RouteBuilder().takeEvery("A", "A", waitUntilTrue);
    store = createStore<string>(
      reducer,
      applyMiddleware(makeSagaMiddleware(routes))
    );
  });

  it("loops", () => {
    store.dispatch({ type: "A" });
    expect(store.getState()).toBe("A");
    routes.continueThread("A", "wait", false);
    expect(store.getState()).toBe("looping");
    routes.continueThread("A", "wait", false);
    expect(store.getState()).toBe("looping");
    routes.continueThread("A", "wait", true);
    expect(store.getState()).toBe("done");
  });
});

describe("ping-pong", () => {
  let routes: RouteBuilder;
  let store: Store<String>;

  beforeEach(() => {
    // PING and PONG will start the other and terminate if they yield true, or
    // dispatch DONE otherwise.
    routes = new RouteBuilder()
      .takeEvery("PING", "PING", ifTrueAElseB("PONG", "DONE"))
      .takeEvery("PONG", "PONG", ifTrueAElseB("PING", "DONE"));
    store = createStore<string>(
      reducer,
      applyMiddleware(makeSagaMiddleware(routes))
    );
  });

  it("alternates", () => {
    store.dispatch({ type: "PING" });
    expect(store.getState()).toBe("PING");
    routes.continueThread("PING", "wait", true);
    expect(store.getState()).toBe("PONG");
    routes.continueThread("PONG", "wait", true);
    expect(store.getState()).toBe("PING");
    routes.continueThread("PING", "wait", false);
    expect(store.getState()).toBe("DONE");
  });
});
