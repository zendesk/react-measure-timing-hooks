---
title: 'Time to Interactive'
source: https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit
---

# **Time to Interactive**

## **Definition**

**_Time to Interactive_** is the first moment when a website is completely and delightfully interactive \- not only _everything_ shown on the page is interactive, but the page strictly meets the I guideline of RAIL: the page yields control back to main thread at least once every 50ms, giving the browser enough breathing room to do smooth input processing.

The basic concept of First Time to Interactive definition is we look for a 5 second window W where the network is mostly quiet (no more than 2 network requests in flight at any given time) _and_ there are no tasks longer than 50ms in W. We then find the last long task before this window and call the end of that task Time to Interactive.

LRS \= Last Required Span

## **Precise definitions of Time to Interactive:**

Find a the first 5 second window W after RTE such that

- W overlaps no long tasks longer than 50ms
- For all timestamp t in W, number of resource requests in flight at t is no more than 2\.

Now find the last long task L before W.

- Time to Interactive is the end of L
- In the case there is no long task before L, Time to Interactive \= RTE.
