## Executive Summary

Methods of frontend performance monitoring at Zendesk lack standardization, are complex and inefficient, and are missing key capabilities. To address these issues, we are proposing the adoption of a frontend performance tracing standard inspired by OpenTelemetry. Its key aspects include:

- An event-based tracing engine with the ability for engineers to record traces that include data provided by the browser [Performance APIs](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API) (such as network requests), as well as from custom events (such as component renders in React) that occurred while the trace was active.
- Clear standards and conventions:
  - A limitation that traces will represent a Product Operation: a process resulting in a change to the user's experience (e.g. _opening a ticket_)
  - The primary way of creating duration metrics would be to derive them from data in the trace

The new model serves the needs of new product features by unlocking new capabilities:

- The ability to capture metrics in any dynamic layout (e.g. Flexible Layouts).
- The ability to define useful new SLIs computed from the trace data.
  For example: _after clicking to load a ticket, how long does it take to start fetching backend data?_

Additionally, it will enable us to replace existing SLI metrics with more accurate ones, as well as unify performance monitoring practices, reduce operational costs, and empower teams to leverage detailed performance profiles, leading to new, actionable insights.

This standard will be described in two RFCs:

- _This RFC’s_ focus is to define the Product Operation model and a high-level overview of its engine.
- A _second RFC_ (to be published subsequently) will go over usage standards and adoption strategy. The adoption will involve integrating the new model into our frontend applications, phasing out legacy metrics, and providing tools, documentation, and training for teams.

## Context

### Problem

There is no industry consensus regarding best practices, or any de-facto standards, or proposals related to capturing performance data on the frontend, like there is with backend (e.g. OpenTelemetry).

At Zendesk, the implementation of frontend performance monitoring varies between teams and products: from non-existent, to relying on capturing durations and counts sent to Datadog Metrics, and in some cases leveraging tools like Datadog RUM (Real User Monitoring) and our in-house built React Timing Hooks library.

Regardless of the tool, frontend performance monitoring is hindered by several critical issues:

1. **Lacking Frontend Observability Capabilities**:

   - **Not reflective of user’s experience**: Existing metrics often focus on internal processing durations (like component rendering time) without capturing the full scope of the user's experience from action initiation to interaction readiness.
   - **Inadequate or noisy context for metrics**: Tools like Datadog Metrics and RUM either lack context or generate excessive/irrelevant data, making it difficult to derive actionable insights about individual user interactions, or aggregated user experiences.
   - **Incompatible with Flexible Layouts:** No framework to handle a more dynamic & modular frontend architecture, forcing developers to create imperfect metrics using bespoke implementations.

2. **Lack of Standardization**:

   - **Undefined Metric Criteria**: There are no unified standards for how to define effective frontend metrics, when to introduce new metrics, or where metrics should be reported.
   - **Lack of Naming Conventions and Ownership Models**: Absence of codified naming conventions for frontend metrics and clear ownership models results in confusion, duplication, and lack of accountability for metric maintenance and relevance.
   - **No Standards for Metric Metadata (Tags and Attributes)**: Without guidelines on what metadata should be attached to metrics and how it should be structured, metrics lack consistent annotations, reducing their usefulness for analysis and correlation, and needlessly inflating their cost.

3. **Operational Inefficiencies**:

   - **Operational Costs**: Metrics are frequently added without proper evaluation, leading to an overwhelming number of mostly unutilized and redundant metrics and unnecessary increases in Datadog spending.
   - **Complex Implementations**: Efforts to capture metrics are often bespoke. Even in Support, where [a custom metrics library](https://github.com/zendesk/retrace) is in use, we had to rely on hacks to make their starting point be a user interaction, resulting in complex and error-prone implementations.
   - **Limited Impact on Performance Optimization**: The current metrics systems do not provide the granular insights required to effectively diagnose and optimize frontend performance, leading to prolonged incident response times and missed optimization opportunities.

These challenges collectively prevent Zendesk from achieving comprehensive and effective frontend performance monitoring, hindering our ability to understand and optimize the customer's experience.

### React Timing Hooks library {#react-timing-hooks-library}

The [React Timing Hooks library](https://github.com/zendesk/retrace) was developed as part of the [Early Problem Detection Initiative](https://zendeskdev.zendesk.com/hc/en-us/articles/1260807009070-What-is-the-EPD-initiative), driven by the [Reliability Roadmap 2021](https://zendesk.atlassian.net/wiki/spaces/ENG/pages/4972806773#ReliabilityRoadmap2021-ops-dashboards-20212021.4.Level1CoreFeatureshavemonitoringforrequestrateanderrorsonservicedashboards) to provide a consistent method for [tracking React component performance](https://zendesk.atlassian.net/wiki/spaces/PLRS/pages/5160961924/Metrics+and+Monitoring). It is the closest thing we have to a standard usage pattern for creating metrics, and is relied upon by many Support teams for long-term tracking in Datadog Metrics, and SLO alerting through Datadog Monitors.

Its adoption fostered a sense of ownership and accountability, as teams could regularly review, and act upon any performance anomalies around their component’s rendering duration. It has also enabled the creation of performance tests, helping prevent degradation at the pull request stage.

Despite these advantages, the library’s design tightly couples metrics with React’s rendering lifecycle, limiting its effectiveness, mainly because component render times are inadequate proxies of user-perceived performance. We started trying to coerce individual metric implementations to work around this limitation, and keep using the library to capture metrics it wasn’t designed to capture. This led to poor-quality results, creation of overlapping metrics (increasing the Datadog spending), and general bloating of the UI code, confusing engineers trying to debug them.

A hard blocker for continuing usage of the library is that it also lacks the ability to capture an operation which includes a dynamic list of renderable components (dynamic/flexible layouts), as it requires that a hardcoded list of components must _always_ appear on the page during rendering.

## Proposal

Today, we think of duration metrics as standalone, independent values. We are proposing the adoption of a performance tracing model, which connects measurements that underlie a specific action taken by the user. In this model, all duration metrics are derived from a **Product Operation** trace, allowing us to measure the performance in the context of what the user is doing.

We believe this will:

- translate into a better understanding of the user's experience in specific product flows/routines
- improve the quality of metrics added, by directing engineers to consider their context

The model is heavily inspired by OpenTelemetry, adapting it to the frontend’s specific requirements in a compatible way.

### Key Terms

- **Product Operation**: A process resulting in a change to the user's experience, typically initiated by a user's action (e.g. _click, hover, key press_) and ending when a target UI state is reached (e.g. _a new UI element has appeared_).

  Examples: _opening a ticket, navigation to a new subsection, displaying a menu, or displaying an update to the UI after an automation is triggered_.

- **Trace**: A uniquely identifiable recording that includes the list of spans that have occurred during the operation. In the context of our frontend tracing model, each trace represents the full, detailed story of a **Product Operation**, from start to finish.

- **Span**: A span represents a unit of work. Spans are the building blocks of **traces**. They include properties such as `type`, `name`, `start time` (relative to the trace’s start time), `duration`, `attributes` (metadata), and `status` (to indicate errors or partial failures).

  Examples: network requests, UI component renders, asset loading, and other processing tasks.

  A span with a duration of _0 ms_ may be used to annotate a meaningful, singular point in time in relation to a **trace**.

  Examples: _page becoming interactive, user clicking an element on the page, an error occuring_.

### Model Overview

[model-overview.md](./model-overview.md)

### Not in Scope

While this approach also opens possibilities for future integration with backend tracing systems like OpenTelemetry—using frontend operations as root traces for backend operations—such integration is beyond the scope of both proposals.

## Stakeholders

- **Frontend Engineering Teams**
  - **Frontend Teams**: currently using the [React Timing hooks library](https://github.com/zendesk/retrace).
  - **Other Frontend Teams:** not currently using any metrics tools or relying solely on Datadog Metrics and RUM.
  - **Platform Teams** focused on application performance.
  - **Product Teams** interested in understanding and improving the customer experience through performance metrics.
  - **QA**: Teams involved in testing performance (e.g., Ghostbusters tests) and ensuring the reliability of metrics
- **SRE**: Teams managing tools like Datadog and interested in reducing unnecessary operational costs, monitoring, and incident response.
- **Engineering Leadership**: Architects and managers overseeing engineering practices and standards.

## Alternatives considered

### Incremental improvements

We could introduce incremental improvements to the React Timing hooks library, try to establish more frontend observability standards, and clean-up existing metrics. Unfortunately, the architectural limitations of the library ([described earlier](#react-timing-hooks-library)) make it impossible to satisfy all our observability requirements, and thus the approach would only solve a subset of the problems that we’re faced with.

For these reasons, we concluded that continuing to evolve existing practices is not a valid alternative.

### Traces not tied to a Product Operation

There’s nothing specific about the tracing model that makes us link them to the concept of a **Product Operation**. However, after analyzing the existing SLIs and other metrics in Zendesk Support, in each of those cases the metric could have been a higher quality signal if it were captured as part of a **Product Operation**. We believe so for the following reasons:

- By [constraining the start](?tab=t.0#bookmark=id.z7kdx4m91zdr) to either an action of the user, or of a remote system, the **trace’s** duration better reflects the user’s actual experience, rather than representing the implementation detail of the internal system
- A broader trace also improves analyzability, as it contains a greater context of **spans**
- It adds the capability to calculate the relative delay from a user’s action, to the moment of an event taking place, exposing unwanted waterfalls in implementation, and enabling critical path analysis

While we could allow **traces** that have an arbitrary start, and an arbitrary end, we feel that the quality of the SLIs derived from it would suffer. We decided to constrain the traces to situations that match the definition of a Product Operation, at least until a compelling use-case to do otherwise arises.

## Consequences

### Metrics are more closely aligned with user’s experience, but incompatible with historical data

One of the key consequences to consider with adopting this model for frontend metrics is the break in continuity with our existing metrics. Due to the fact that the new metrics will reflect the user’s experience more accurately, we will not be able to compare the new data directly with the metrics of the past. In some cases we may need to revise our SLOs to reflect the higher accuracy.

### Conceptual shift

While the API of the new implementation is simpler, we expect that teams will need some time to get familiar with it, due to the conceptual shift from thinking about capturing individual metrics to metrics that are defined and derived from **Product Operations**. Developers will need to decide if their use case warrants a new **Product Operation**, or can contribute to an existing one. In practice, we expect a limited number of **Product Operations** to be created in each product.

More specific details about the required code changes will be published in a second RFC.

### Enables more advanced capabilities

With the new model, we’ll unlock some exciting new capabilities. Some of the most notable ones are:

- The ability to capture metrics in the Flexible Layouts feature (or any dynamic layout).
- The ability to define useful new SLIs computed from relative span start and span end points.
  For example: _after clicking to load a ticket, how long does it take to start fetching backend data?_
- Compatibility with OpenTelemetry opens the door to enabling end-to-end tracing.
- Improved debuggability of the metrics. Since the resulting trace is plain JSON, we’ll be able to capture granular data locally, or directly from customer’s computers during escalations, and analyze it using a custom visualizer.

![visualizer](./visualizer.png)
_An example of a Product Operation trace visualization experiment_

### Less complex & easier to implement than React Timing Hooks

A set of functions (hooks) had to be generated for each metric that we wanted to capture. In cases where a component was part of multiple metrics, it had to include hooks for each of them. The execution of the hook (while rendering the UI) was responsible for starting the metric implicitly. This resulted in code duplication, overlap of metrics and made things hard to reason about. It was also more error-prone, as it was easy to misconfigure the hook.

With the new model, **traces** are started explicitly and can happen outside of a React render. Furthermore, instrumenting a React component only requires a single hook call to be able to contribute its render data to a **trace**. This results in far less code to capture metrics, and makes adding instrumentation to new components substantially easier.

## Rollout plan

A subsequent RFC will detail the implementation patterns, naming conventions and a proposal for how to move existing SLIs to the new model.

As our team is primarily focused on Support and Agent Workspace, we would love feedback from other frontend teams to ensure its implementation is universally applicable. We strongly believe in the positive impact of expanding our understanding of the user experience by tying the metrics directly to it. If you think so too, have opinions about it, or are interested in having input in further development of these ideas, please leave a comment or reach out to us at \#ask-pingu.
