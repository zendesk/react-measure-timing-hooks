## Span hierarchies

While pondering on a good way to remove our dependence on hijacking Datadog Browser SDK resource events I came to the conclusion that we need two new mechanisms:

- for creating span hierarchies during the operation (matching parents/children)
- for merging a 0-duration `start` and `end` spans into a single span with a duration (and combined metadata)

Hierarchies would allow us to more easily see the network duration vs processing duration:

```
|-[--APOLLO QUERY--------------------------]----
|--[RESOURCE (actual network call)]-------------
```

Here we can see there's a bunch of time spent processing the data in Apollo, and the need to group these together in a hierarchy.

Right now, the visualizer depends on hacks to match and overlay graphql network requests with the timings from our Apollo Client instrumentation.
(namely, we have a step where we rename the resources to have the same name as the Apollo Query, so they show up on the same row, overlayed)
And because we depend on Datadog RUM, when it's not initialized, sometimes these are not merged correctly.

e.g. for fetches we have can instrument these events:

```
|- before_fetch (start mark)
|- fetch_complete / fetch_abort (end mark)
|- 'resource' performance entry # and this might come before or after complete!
```

for GQL fetches even more:

```
|- before_GQL (unknown URL, so need to match on something else, like Lotus feature + operation name)
--|- before_fetch
--|- fetch_complete / fetch_abort
|- after_GQL
|- 'resource' performance entry
```

Local GQL could even have multiple fetch requests and resources as part of a single query. If we were to add the initiator of the fetch (e.g. React component/hook), then that's one more layer that wraps these (we could do this linking dynamically by synchronously writing and reading a frame ID during rendering - see "Additional ideas" below).

There needs to be a way to "hook up" traces up to their parents.
But how do we define the relationship if we don't have full control over the spans?

It looks like DD SDK matches the `'resource'` PerformanceEntry by URL (`entry.name`) and time (entry that happened after initial fetch and ended before fetch complete, with some margin of error). It's unfortunate, but I don't see any other/better way. We can recreate this logic easily though.

## Proposal

A span could include some additional optional properties:

```ts
// example of additional properties of the before_fetch span
{
  ...span,
  // makes any matching parentless span within the timeframe of this one a child; timeErrorMargin can be a number (ms) or an object {start, end}
  adoptSpansAsChildren: [{type: 'resource', name: url, timeErrorMargin: 5 }],
  endMarkerSpan: matchSpan.withId('xyz'),
}
```

Then the ending span would simply also include that ID, e.g.:

```ts
{ id: 'xyz', ...span }
```

Once we see the `endMarkerSpan`, we update the original span's duration by calculating it, and merge the metadata (ending span wins).

ID generation could be made easier with a helper function: `const {span, makeCloseSpan} = makeOpenSpan({...spanProps})`
The resulting `span` wouldl include the `endMarkerSpan`.
And calling `makeCloseSpan({...spanProps})` would include that `id` automatically.

Once we see a parentless span that matches the `adoptSpansAsChildren`, we set its parent accordingly.

We could also make it possible to do the reverse - set parent the span directly when creating the child span:

```ts
{ parentId: 'xyz', ...span }
```

This is the more classical approach that OTEL and other tracing tools take - where you _have_ to know the _parentId_ upfront - before you start the child.

Span's `id` would still be an optional property, we'd refer to OpenTelemetry to generate one if one is not set.

## References

- DD browser SDK:
  - [matching 'resource' to fetch](https://github.com/DataDog/browser-sdk/blob/main/packages/rum-core/src/domain/resource/matchRequestResourceEntry.ts)
  - [fetch instrumentation](https://github.com/DataDog/browser-sdk/blob/main/packages/core/src/browser/fetchObservable.ts)

## Additional ideas:

We could auto-group spans into _frames_ - if there happen to be multiple spans created/processed in the same frame, they can all be assigned a frameId, and in the visualizer that would enable us to additionally see what got triggered in which frame. We could even generate a "frame" span that wraps all the parent-less
