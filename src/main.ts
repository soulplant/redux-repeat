import {
  Action,
  Dispatch,
  Middleware,
  MiddlewareAPI,
  Store,
  applyMiddleware,
  createStore
} from "redux";

interface AsyncHandler {
  handleAsync(
    sagaName: string,
    stepName: string,
    object: any,
    method: Function,
    args: any[]
  ): void;
}

export function add(x: number, y: number): number {
  return x + y;
}

export const reducer = (n: string = "", action: Action): string => {
  return action.type;
};

class Clock {
  delay(millis: number): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(resolve, millis);
    });
  }
}

const clock = new Clock();

export type Effect = [string, any, any, any];

function* saga(
  clock: Clock,
  dispatch: Dispatch<string>,
  getState: () => string
): IterableIterator<Effect> {
  try {
    console.log("about to wait");
    const result = yield ["wait", clock, clock.delay, 100];
    console.log("resuming with", result);
    dispatch({ type: "A" });
    yield ["wait-again", clock, clock.delay, 200];
    dispatch({ type: "B" });
  } catch (e) {
    console.log("exception", e);
    dispatch({ type: "EXCEPTION" });
  }
}

type RouteEntry = {
  type: string;
  name: string;
  saga(...args: any[]): Thread;
  args: any[];
};

type Thread = IterableIterator<Effect>;

type RunningThread = {
  // The currently pending effect for this thread.
  effect: Effect;

  // The executing thread.
  thread: Thread;
};

export class RouteBuilder {
  private routes: { [type: string]: RouteEntry } = {};
  private threads: { [type: string]: RunningThread } = {};
  constructor() {}

  // When an action with the given type is dispatched, start a fresh instance of
  // the given saga. Multiple threads of the same saga are given an index equal
  // to the number of concurrent threads in that saga already running.
  takeEvery(
    type: string,
    name: string,
    saga: (...args: any[]) => IterableIterator<Effect>,
    ...args: any[]
  ): RouteBuilder {
    this.routes[type] = { type, saga, name, args };
    return this;
  }

  // Called after an action is dispatched. This starts the relevant saga if
  // necessary.
  handleAction<S>(action: Action, store: MiddlewareAPI<S>): void {
    const entry = this.routes[action.type];
    if (!entry) {
      return;
    }
    // TODO(james): When starting a thread deal with other threads for the same saga either by
    // canceling them or ignoring them.
    const thread = this.startThread(entry, store);
    if (thread) {
      this.threads[action.type] = thread;
    }
  }

  continueThread(name: string, step: string, value: any): void {
    const thread = this.getRunningThread(name, step);
    const result = thread.thread.next(value);
    if (result.done) {
      this.removeCompletedThread(name, step);
      return;
    }
    thread.effect = result.value;
  }

  errorThread(name: string, step: string, error: any): void {
    const thread = this.getRunningThread(name, step);
    thread.thread.throw!(error);
  }

  private removeCompletedThread(name: string, step: string): void {
    // TODO(james): Ensure the step is right.
    delete this.threads[name];
  }

  private getRunningThread(name: string, step: string): RunningThread {
    const thread = this.threads[name];
    if (step !== thread.effect[0]) {
      throw new Error(
        "Thread is in step " +
          thread.effect[0] +
          ", not " +
          step +
          ", so refusing to continue"
      );
    }
    return thread;
  }

  startThread<S>(
    entry: RouteEntry,
    store: MiddlewareAPI<S>
  ): RunningThread | null {
    const thread = entry.saga(
      ...entry.args,
      store.dispatch.bind(store),
      store.getState.bind(store)
    );
    const result = thread.next();
    if (result.done) {
      return null;
    }

    // TODO(james): If running in 'live' mode, execute the promise and hook it
    // up to the corresponding thread.

    return { thread, effect: result.value };
  }
}

export const makeSagaMiddleware: (routes: RouteBuilder) => Middleware = (
  routes: RouteBuilder
) => <S>(store: MiddlewareAPI<S>) => <S>(next: Dispatch<S>): Dispatch<S> => <
  A extends Action
>(
  action: A
): A => {
  next(action);
  routes.handleAction(action, store);
  return action;
};
