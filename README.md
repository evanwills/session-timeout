# `<session-timeout>`

* [Introduction](#introduction)
* [Required attributes](#required-attributes)
  * [`duration`](#duration)
* [Optional attributes](#optional-attributes)
  * [`when`](#when)
  * [`keepalive`](#keepalive)
  * [`keepaliveCallback`](#keepaliveCallback)
* [Events](#events)
  * [Listened for events](#listened-for-events)
    * [`resetsession`](#resetsession)
    * [`setsessionend`](#setsessionend)
    * [Standard DOM events](#standard-dom-events)
  * [Dispatched events](#dispatched-events)
    * [`sessiontimetoutactive`](#sessiontimetoutactive)
    * [`sessionexpired`](#sessionexpired)
    * [`sessionwillend`](#sessionwillend)
    * [`sendkeepalive`](#sendkeepalive)

---

## Introduction

`<session-timeout>` is a web component that helps users see when
their authenticated session will expire.

The session timeout can be reset by dispatching a `setsessionend`
Event/CustomEvent with a date-time string or a `resetsession`
Event/CustomEvent (no value expected) from anywhere else in the DOM.
`<session-timeout>` listens for these two events and does its magic
when it hears them.

It is written in pure JavaScript so the `public/session-timeout.js`
can be included via a script tag on any web page or included within
your normal JS bundle.

## Required attributes

### `duration`

The maximum number of milliseconds a session can live for.

> __Note:__ If `duration` is less than 180000 (3 minutes), it is
>           assumed to be in seconds and will be multiplied by 1000
>           to convert it to millisecionds.

The following will set the session time out to five minutes from the
time the component is rendered. (If the [`when`](#when) attribute is present
and has a valid [ISO 8601 date-time](https://en.wikipedia.org/wiki/ISO_8601)
string, then)

```html
<session-timeout duration="300"></session-timeout>
```

## Optional attributes

### `when`

An ISO 8601 date-time string to specify exactly when the session will
expire.

The following will set the session timeout at 9:42am 12th November
2024 (UTC).

If a [`resetsession`](#resetsession) event is heard, the session
timeout will be reset to five minutes after the event is recieved.

```html
<!-- Session will expire at 9:42am on the 12th of November 2024 (UTC) -->
<session-timeout duration="300" when="2024-11-12T09:42:11Z"></session-timeout>
```

### `keepalive`

Minimum number of seconds between emitting `keepalive` events.

Sometimes you want to automatically reset the session timeout based
on user interaction with the page/app.

> __Note:__ If `keepalive` value is less than the `minKeepalive` (30)
>           value then no `keepalive` events will ever be fired.

If `keepalive` is greater than 30, a [_"sendkeepalive"_](#sendkeepalive) event will be
dispatched no more than once every `keepalive` seconds.

When `<session-timeout>` is in keep alive mode, a [_"sendkeepalive"_](#sendkeepalive)
event will be dispatched no more than once every _X_ seconds as
specified by `keepalive`.

> __Note:__ If [`keepaliveCallback`](#keepaliveCallback) is a
>           function then the `keepaliveCallback` function will be
>           called instead of dispatching a
>           [_"sendkeepalive"_](#sendkeepalive) event .

```html
<!-- Send a keepalive event no more than once every 90 seconds -->
<session-timeout duration="300" keepalive="90"></session-timeout>
```


### `keepaliveCallback`

A function that `<session-timeout>` can call to do some keep-alive stuff.

> __Note:__ If `keepaliveCallback` is called and throws an error,
>           `<session-timeout>` will fall back to dispatching
>           _"sendkeepalive"_ events.

The easiest way to set `keepalivecallback` is to listen for a
[`sessiontimetoutactive`](#sessiontimetoutactive) event and set the
function on the `event.target`.

## Events

### Listened for events

#### `resetsession`

`<session-timeout>` watches for `resetsession` events on the
`document`. If it recieves an event it will reset the session timout
to the current time plus the duration.


The `resetsession` listener does not use any values from the event
object.

#### `setsessionend`

#### Standard DOM events

If `<session-timeout>` is in [`keepalive`](#keepalive) mode, it
listens for the following events emitted as a side effect of user
interactions with the page.

* `onfocus`,
* `onblur`,
* `onkeyup`
* `onmousedown`
* `onscrol`

> __Note:__ If code between the event emitter and the `document`
>           calls `Event.preventDefault()`, `<session-timeout>` will
>           never hear that event.

If it receives any of the events it checks to see when the last one
was received and if it's been long enough, it will either dispatch a
`sendkeepalive` event or call [`keepaliveCallback`](#keepalivecallback)
if it's callable function.

### Dispatched events

#### `sessiontimetoutactive`

The `sessiontimetoutactive` Custom event is dispatched when
`<session-timeout>` component becomes active. If this event is
listened for you can use the event target to set
[`keepalliveCallback`](#keepalivecallback) value.

e.g.

```javascript
const doSomeKeepAliveStuff () => {
  // Make a fetch call to the server to keep the current session alive
  ...
};

const sessionTimeoutActiveHandler = (event) => {
  if (typeof event.target !== 'undefined'
    && typeof event.target.keepaliveCallback !== 'undefined'
  ) {
    event.target.keepaliveCallback = doSomeKeepAliveStuff;

    // We only need to do this once, so may as well remove the event
    // listener now we're done.
    document.removeEventListener('sessiontimetoutactive', sessionTimeoutActiveHandler);
  }
};

document.addEventListener('sessiontimetoutactive', sessionTimeoutActiveHandler);
```

#### `sessionexpired`

The `sessionexpired` Custom Event is dispatched when the session
timeout reaches zero. Its `detail` value is set to `TRUE`.

#### `sessionwillend`

The `sessionwillend` Custom Event is dispatched every time the
`<session-timeout>` value on screen updates. Its `detail` value is
the number of seconds remaining until the session timeout.

(sample Vue usage)
```html
<template>
  <dialog ref="sessionRefreshDialogue">
    <h1>Session is nearly expired</h1>
    <p>Click the button to refresh your session</p>
    <p><button type="button" @click="refreshSession">Refresh</button></p>
    <button type="button" @click="closeModal">X</button>
  </dialog>
</template>

<script setup>
import { ref, onBeforeMount, onUnmounted } from 'vue';

const sessionRefreshDialogue = ref(null);
const listening = ref(false);

const sessionwillendHandler = (event) => {
  if (typeof event.detail === 'number'
    && event.detail > 55 && event.detail < 65
    && sessionRefreshDialogue.value.open === false
  ) {
    sessionRefreshDialogue.value.showModal();
  }
}

const refreshSession = () => {
  window.fetch('https://example.com/keep-alive')
    .then((response) => {
      // In the response handler we are going to emit an event that
      // `<session-timout>` is listeing for so it can reset the
      // session timeout time

      // This is not very efficient but we're not doing it very often
      const tmp = document.querySelector('body');

      if (tmp !== null) {
        // tmp.dispatchEvent(new CustomEvent('resetsession'));

        // The above Event is much easier to write but the below
        // event is more reliable since the server knows best

        tmp.dispatchEvent(new CustomEvent('setsessionend', response.endTime));
      }
    });
}

const closeModal = () => {
  if (sessionRefreshDialogue.value.open === true) {
    sessionRefreshDialogue.value.close();
  }
}

onBeforeMount(() => {
  if (listening.value === false) {
    listening.value = true;
    document.addEventListener('sessionwillend', sessionwillendHandler);
  }
});
onUnmounted(() => {
  if (listening.value === true) {
    document.removeEventListener('sessionwillend', sessionwillendHandler);
  }
});
</script>
```

#### `sendkeepalive`

The `sessionwillend` Custom Event is dispatched every time after a
user interaction with the page but no more frequently than the number
of seconds specified by [`keepalive`](#keepalive).

This event handler can be placed anywhere in the code but if you have
somewhere you handle session authentication, it should probably go
there so it has everything it needs.

```JavaScript
const keepaliveHandler = () => {
  window.fetch('https://example.com/keep-alive')
    .then((response) => {
      // In the response handler we are going to emit an event that
      // `<session-timout>` is listeing for so it can reset the
      // session timeout time

      const tmp = document.querySelector('body');

      if (tmp !== null) {
        tmp.dispatchEvent(new CustomEvent('resetsession'));
      }
    });
}

document.addEventListener('sendkeepalive', keepaliveHandler);
```
