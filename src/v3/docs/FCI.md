---
title: 'First CPU Idle'
source: https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
---

# Time To Interactive defined as First CPU Idle

For **_First CPU Idle_** we recommend “Proportional \+ LonelyTask”, which gradually shrinks the size of the quiet window required, and ignores long tasks if they are isolated enough.

# **Definition**

**_First CPU Idle_** is the first moment when a website is minimally interactive: _enough_ (but maybe not all) UI components shown on the screen are interactive, and the page responds to user input in a _reasonable_ time _on average,_ but it’s ok if this response is not always immediate.

## **First CPU Idle \- "Task Cluster" Definition**

_FirstCPUIdle_ can be defined in terms of _TaskClusters_ and characterizing the task clusters as _heavy/light._ This leads to a cleaner implementation compared to the definition in terms of lonely tasks.

Informally, First CPU Idle can be defined as the beginning of a sufficiently large quiet window that doesn’t contain a big group of densely packed long tasks. The required size of the quiet window is 5 seconds at FMP, but it slowly decreases, with reaching 3 seconds when the beginning of window is 15 seconds after FMP, and asymptotically reaches 1s.

We provide formal definitions of all the terms here:

## **Long Task**

Any main thread task with duration ≥ 50ms.

## **TaskCluster**

A non-empty set of long tasks such that all the tasks in the set are at least 1s second away from any long task not in the set.
It obviously follows that two task clusters have an interval of at least 1 second between them with no long tasks.
_Duration_ of a TaskCluster is defined as the duration between the beginning of the first long task and the end of the last long task.

## **Heavy and Light TaskCluster**

A TaskCluster is considered **_heavy_** if its duration is ≥ 250ms. Otherwise, it is considered **_light_**.

## Required Quiet Window Size

We become more lenient about the required quiet window size the further away we are from FMP. The required quiet window size at for a window starting at \( t \) seconds from FMP, \( \text{req}(t) \), is assumed to have exponential decay with the following constraints:

- \( \text{req}(0) = 5 \). The required quiet window size is 5 seconds at FMP.
- \( \text{req}(15) = 3 \)
- \( \text{req}(t) \to \infty \) as \( t \to \infty \)

Exponential decay is given by the equation \( \text{req}(t) = ae^{-bt} + c \)
Solving for the constraints mentioned above, we get
\( a = 4 \)
\( b = -\frac{1}{15} \log \left( \frac{1}{4} (3 - 1) \right) = \frac{1}{15} \log (2) \)
\( c = 1 \)

## First CPU Idle

Let \( \text{req}(t) = 4e^{-bt} + 1 \), where \( b = \frac{1}{15} \log(2) \), be the required quiet window size for a window starting at \( t \) seconds from FMP.

We find the first window \( W \) after FMP such that

- If \( W \) does not overlap any _heavy_ TaskCluster
- Duration of \( W \leq \text{req}(W.\text{start} - \text{FMP}) \)

**First CPU Idle** = \( W.\text{start} \).
