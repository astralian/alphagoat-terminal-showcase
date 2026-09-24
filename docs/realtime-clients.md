# Real-time clients: current views without a second trading engine

[Overview](../README.md) · [Code example](../examples/README.md)

The interface must remain responsive while showing state that can change outside the application. A user can trade directly on the exchange, lose their connection, switch accounts, or resume a suspended phone. Rendering the newest arriving message is insufficient.

## One transport owner, narrow consumers

Each platform composes one portable HTTP transport and one physical socket owner. Feature modules own exact routes and strict payload decoding. Components consume those owners rather than creating their own sockets or ad hoc request paths.

Session and account generations reject responses belonging to retired contexts. Account switching therefore has a correctness boundary, not just a route transition. Last-known views and editable drafts can survive interruption while stale command controls remain disabled.

## Structural state and fast valuation must agree

The terminal publishes structural account revisions. Faster market-driven valuation updates are admitted only against the matching current READY revision.

For example, a valuation calculated for revision 7 cannot update a balance after revision 8 has changed the position inventory. Vanilla store subscribers can also change readiness during a commit, even inside renderer batching.

This is why batching React renders alone is insufficient to establish cross-store correctness.

## Walkthrough: a late valuation after a position change

Imagine that the terminal displays an open position. The server has published revision 7 of the account structure, and a price-driven update calculates balances for that revision. Before the browser applies that update, the position closes and revision 8 arrives. Applying the queued valuation would mix the new position list with balances calculated for the old one.

| Event | Terminal state | Required behavior |
| --- | --- | --- |
| The client receives a valuation for revision 7 | Revision 7, READY | Queue the renderer callback. |
| A newer structural publication arrives | Revision 8, READY | Adopt the new position inventory. |
| The queued valuation callback runs | Revision 8, READY | Discard the revision-7 valuation before either store changes. |

The product's `commitValuationBatch` function in `packages/client/src/terminal/commit.ts` checks these conditions when the callback **executes**. In the excerpt below, `terminalStore` holds account views and balances, `marketStore` holds price-driven frames, and `batch.revision` identifies the structure used to calculate the valuation. `selectTerminalViewCurrent` also checks that the account view belongs to the current transport context.

```ts
const terminalState = terminalStore.getState();
const view = terminalState.views[batch.accountId];
if (
  !selectTerminalViewCurrent(terminalState, batch.accountId) ||
  view?.status !== "READY" ||
  view.revision !== batch.revision
)
  return;
const accepted = marketStore
  .getState()
  .applyReadyValuationFrames(batch.accountId, batch.marketFrames, batch.revision);
if (accepted && terminalStore.getState() === terminalState)
  terminalStore.getState().applyValuationBalance(batch.balanceFrame);
```

The final identity check handles a second ordering problem. Updating the market store can synchronously notify a subscriber that changes terminal readiness. If that happens, the captured terminal state is no longer current, so the old balance must not advance. Store-level frame validation and invalidation remain part of the overall admission rule.

The regression test deliberately queues the callback, advances the terminal revision, captures both stores, and only then runs the callback. It checks that both store identities remain unchanged. Related cases invalidate readiness from inside a synchronous subscriber. These tests verify the ordering boundary without depending on a browser frame or an arbitrary delay.

This coordination stays in the portable client package. Web and native provide their renderer batching function while sharing the rule that a valuation belongs to one specific account revision.

## Share portable behavior, retain platform responsibility

Web and native reuse recovery, receipt coordination, transport schemas, state calculations, and financial presentation logic. Each app owns its renderer, navigation, platform storage adapter, and lifecycle integration.

Suspension stops receipt observation without discarding unresolved evidence. Resume starts a new fenced observer. Reconnection does not enqueue a financial mutation, replay a command, or overwrite a newer draft with a late callback.

The cost is maintaining explicit platform lifecycle adapters and qualifying each platform separately. Shared logic reduces duplicated behavior; it does not prove identical rendering or physical-device performance.

## Performance follows ownership

Shared public streams avoid repeating upstream demand for every account. Downstream coalescing limits publication work when upstream updates arrive faster than useful presentation cadence. Narrow selectors keep unrelated market changes from invalidating every visible component.

A store-fanout measurement script and a runtime measurement harness help identify unnecessary subscriber work and expensive runtime stages. Controlled fixtures isolate individual costs; runtime telemetry and device measurements capture behavior under actual operating conditions.

Useful measurements include upstream events, accepted market batches, selector invalidations, account publication time, and client apply/presentation time. A single average response-time number would conceal where the user actually waits.
