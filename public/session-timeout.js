/**
 * Get duration data based on the now time and the when time
 *
 * @param {number} now    Timestamp for current datetime
 *                        (usually from `Date.now()`)
 * @param {number} when   Timestamp for cut-off datetime
 *                        (usually from ISO 8601 datetime string)
 * @param {string} before Context text for message when rendered
 *                        before cut-off time
 * @param {string} after  Context text for message when rendered
 *                        after cut-off time
 * @param {string} end    Word/string to append to duration period
 *                        after cut-off period has passed
 *
 * @returns {object}
 */
const getDurationData = (now, when, before, after, start, end) => {
  if (Number.isNaN(when)) {
    return {
      dynamicDuration: 'unknown',
      diff: 0,
      endWord: '',
      invalid: true,
      isPast: false,
      prefixTxt: '',
      startWord: `${before}`,
      timeout: 0,
    };
  }

  /**
   * A list of the number of seconds per time unit
   *
   * Incase you're wondering about the two larger numbers:
   * * 1 year = 31557600 = (86400 * 365.25)
   * * 1 month = 2629800 = (31557600 / 12)
   *
   * @var {number[]} multipliers
   */
  const multipliers = [31557600, 2629800, 604800, 86400, 3600, 60];

  /**
   * List of time unit names
   *
   * @var {string[]} units
   */
  const units = ['year', 'month', 'week', 'day', 'hour', 'minute'];

  /**
   * Number of seconds difference between now and the cut-off time.
   *
   * @var {number} _diff
   */
  let _diff = Math.floor((when - now) / 1000);

  /**
   * Whether or not the `now` time is past the cut-off `when` time
   *
   * @var {boolean} _isPast
   */
  const _isPast = (_diff < 0);

  /**
   * The number of seconds to set the next timeout duration
   *
   * @var {number} next
   */
  let next = 1;

  /**
   * The human value for the current duration
   *
   * @var {number} humanVal
   */
  let humanVal = 0;

  /**
   * The unit name for the current duration
   *
   * @var {string} unit
   */
  let unit = 'second';

  /**
   * Text to provide context to the duration rendered
   *
   * @property {string} humanPrefix
   */
  let prefixTxt = before;

  /**
   * The word to use at the end of the duration string
   *
   * If cut-off (`when`) has passed, `end` will be rendered
   *
   * @property {string} endWord
   */
  let _endWord = '';
  let _startWord = '';

  if (_isPast === true) {
    _diff *= -1;
    _endWord = ` ${end}`;
    prefixTxt = after;
  } else {
    _endWord = '';
    prefixTxt = before;
    _startWord = ` ${start}`;
  }
  humanVal = _diff;
  let extra = 0;

  // Find the best unit to render
  for (let a = 0; a < units.length; a += 1) {
    if (_diff > multipliers[a]) {
      // This is the right unit to render

      extra = _diff % multipliers[a];
      next = extra > 0 && _isPast === false
        ? extra
        : multipliers[a];
      humanVal = _diff / multipliers[a];
      unit = units[a];
      break;
    }
  }

  humanVal = Math.floor(humanVal);

  if (_isPast === false && _diff !== 0 && (next % 60) === 0) {
    // We need to do this to help the number tick over to the next
    // value otherwise, we'll have to wait a whole unit period.
    next = 1;
  }

  return {
    dynamicDuration: (_diff === 0)
      ? 'now'
      : `${humanVal} ${unit}${(humanVal !== 1) ? 's' : ''}`,
    diff: _diff,
    endWord: _endWord,
    invalid: false,
    isPast: _isPast,
    prefixTxt,
    startWord: (_diff === 0)
      ? ''
      : _startWord,
    timeout: (next * 1000),
  };
};

const watchableEvents = ['onfocus', 'onblur', 'keyup', 'mousedown', 'onscroll'];

const minKeepalive = 30;

class SessionTimeout extends HTMLElement {
  // ======================================================
  // START:constructor

  constructor () {
    super();

    /**
     * Prefix string/word to use after the cut-off threshold has been
     * past
     *
     * @property {string} after
     */
    this.after = 'expired';

    /**
     * Prefix string/word to use before the cut-off threshold has been
     * past
     *
     * @property {string} before
     */
    this.before = 'expires';

    /**
     * The maximum number of milliseconds a session can live for.
     *
     * > __Note:__ If `duration` is less than 180000, it is assumed
     *             to be in seconds and will be multiplied by 1000 to
     *             convert it to millisecionds.
     *
     * @property {number} duration
     */
    this.duration = 0;

    /**
     * End word to append to the duration to indicate the cut-off has
     * been passed
     *
     * @property {string} end
     */
    this.end = 'ago';

    /**
     * Minimum number of seconds between emitting `keepalive` events.
     *
     * > __Note:__ If keepalive value is less than the minimum
     * >           keepalive value then no `keepalive` events will
     * >           ever be fired.
     *
     * @property {number} keepalive
     */
    this.keepalive = 0;

    /**
     * End word to append to the duration to indicate the cut-off has
     * been passed
     *
     * @property {Function|null} keepaliveCallback
     */
    this.keepaliveCallback = null;

    /**
     * Start word to append to the `before` string to make the text
     * gramitcally correct before the cut-off has been passed
     *
     * @property {string} start
     */
    this.start = 'in';

    /**
     * URL to send the user to after their session has expired.
     *
     * @property {string} url
     */
    this.url = '';

    /**
     * ISO 8601 date-time string when the session will next expire.
     *
     * @property {string} msgPrefix
     */
    this.when = '';

    //  END:  external properties
    // ----------------------------------------------------
    // START: internal properties

    this.isPast = false;

    this._duration = 0;

    /**
     * Date object representing when the session will next expire.
     *
     * @property {Date|null}
     */
    this._end = null;

    /**
     * The setInterval() ID for the watcher that updates the end time.
     *
     * @property {number|null} _interval
     */
    this._timeout = null;
    this._lastInteraction = 0;

    /**
     * Timestamp for when the last `keepalive` event was emitted.
     *
     * @property {number} _lastKeep
     */
    this._lastKeep = 0;

    this._keepalive = 0;
    this._keepaliveCallback = null;

    /**
     * Wrapper span tag for the whole component.
     *
     * @property {HTMLSpanElement} _wrapSpan
     */
    this._wrapSpan = null;

    /**
     * Span tag containing the prefix message
     *
     * @property {HTMLSpanElement} _msgSpan
     */
    this._msgSpan = null;

    this._timestamp = 0;

    /**
     * Span tag containing the human readable time string for when
     * the session will expire
     *
     * @property {HTMLSpanElement} _valueSpan
     */
    this._valueSpan = null;

    /**
     * Span Dialog element to show the user when the session expires.
     *
     * @property {HTMLDialogElement} _modal
     */
    this._modal = null;

    let shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(this.getDOM());
  }

  static get observedAttributes () {
    return [
      'after',
      'before',
      'duration',
      'end',
      'keepalive',
      'start',
      'url',
    ];
  }

  //  END:  constructor
  // ======================================================
  // START: utility methods

  emitEvent (event, detail = true) {
    this.dispatchEvent(
      new CustomEvent(
        event,
        { bubbles: true, composed: true, detail },
      ),
    );
  }

  setEndInner (newEnd) {
    if (newEnd === 'invalid date') {
      throw new Error(
        'SessionTimout.setEndInner() expected only parameter to be an '
        + `IOS8601 date time string. "${dateTimeStr}" could not be `
        + 'parsed by Date().',
      );
    } else if (newEnd.valueOf() < Date.now()) {
      console.warn('<session-timeout> expects new end date-time to be later than now');
      return null;
    } else {
      this._end = newEnd;
    }
  }

  setEnd (dateTimeStr) {
    if (typeof dateTimeStr !== 'string' || dateTimeStr.trim() === '') {
      throw new Error(
        'SessionTimout.setEnd() expected only parameter to be a '
        + 'non-empty string',
      );
    }

    this.setEndInner(new Date());
  }

  sanitiseDuation (duration) {
    let _tmp = duration;

    if (typeof _tmp === 'string') {
      _tmp = parseInt(_tmp, 10);
    }

    if (typeof _tmp !== 'number' || Number.isNaN(_tmp) || Number.isFinite(_tmp) === false) {
      throw new Error(
        '<session-timeout> expects required "duration" attribute '
        + 'to be the number of milliseconds a session will last',
      );
    }

    const mod = _tmp % 1;

    const output = (mod > 0)
      ? Math.round(_tmp)
      : _tmp;

    return (output < 180000) // 3 minutes
      ? output * 1000
      : output;
  }

  updateStrings (context) {
    return () => {
      console.group('updateStrings()');
      if (context.timeout !== null) {
        clearTimeout(context._timeout);
      }

      const tmpNow = Date.now();
      const tmp = getDurationData(
        tmpNow,
        this._end.valueOf(),
        this.before,
        this.after,
        this.start,
        this.end,
      );
      console.log('tmp:', tmp);
      console.log('context._valueSpan.innerText:', context._valueSpan.innerText);
      console.log('tmp.dynamicDuration:', tmp.dynamicDuration);

      if (context.isPast === false && tmp.isPast === true) {
        // We have just transitioned from before to after the expiry
        // date. Let's tell the world that this has happened.
        this.emitEvent('sessionexpired');
      }

      context.isPast = tmp.isPast;
      context.diff = tmp.diff;

      context._msgSpan.innerText = `Session ${tmp.prefixTxt}${tmp.startWord} `;
      context._valueSpan.innerText = tmp.dynamicDuration + tmp.endWord

      if (tmp.invalid === false && tmp.diff < 28800) { // 28800 = 8 hours
        context._timeout = setTimeout(
          this.updateStrings(context),
          (tmp.timeout),
        );
      }
      console.groupEnd();
    };
  }

  //  END:  utility methods
  // ======================================================
  // START: getters & setters

  /**
   * @param {number} input
   */
  set duration (input) {
    try {
      this._duration = this.sanitiseDuation(input);
    } catch (e) {
      console.error(e.message);
    }
  }

  get duration () {
    return this._duration;
  }

  /**
   * @param {number|string} input
   */
  set keepalive (input) {
    const tmp = (typeof input === 'string')
      ? parseInt(input, 10)
      : input;

    if (typeof tmp !== 'number' || Number.isNaN(tmp) === true || Number.isFinite(tmp) === false || tmp < 0) {
      console.error(
        '<session-timout> attribute `keepalive` number or numeric '
        + 'string, greater than zero. '
        + `"${input}" could not be used as keepalive value.`,
      );
    } else {
      this._keepalive = tmp;
    }
  }

  get keepalive () {
    return this._keepalive;
  }

  /**
   * @param {Function} input
   */
  set keepaliveCallback (input) {
    if (input !== null) {
      if (typeof input !== 'function') {
        console.error(
          '<session-timout> attribute `keepaliveCallback` must be a '
          + 'function that expects no arguments. found '
          + `"${typeof input}"`,
        );
      } else {
        this._keepaliveCallback = input;
      }
    }
  }

  /**
   * @param {string} input
   */
  set when (input) {
    try {
      this.setEnd(input);
    } catch (e) {
      if (e.message.includes('non-empty') === false) {
        console.error(e.message);
      }
    }
  }

  //  END:  getters & setters
  // ======================================================
  // START: event handlers

  updateKeepAlive () {
    this._lastInteraction = Date.now();

    if ((this._lastInteraction - this._lastKeep) > this.keepalive * 1000) {
      this._lastKeep = this._lastInteraction;
      if (this._keepaliveCallback === null) {
        this.emitEvent('keepalive', true);
      } else {
        try {
          this.keepaliveCallback();
        } catch (e) {
          console.error(
            '<session-timeout> caught error when calling keepaliveCallback():',
            e.message,
          );
          this._keepaliveCallback = null;
          this.emitEvent('keepalive', true);
        }
      }
    }
  }

  setSessionEnd (event) {
    const when = (typeof event.target !== 'undefined' && typeof event.target.value === 'string')
      ? event.target.value
      : event.detail;

    if (typeof when !== 'string') {
      throw new Error(
        '<session-timeout> expected "setsessionend" event to '
        + 'contain either a `event.details` property or an '
        + '`event.target.value`',
      );
    }

    this.setEnd(when);
  }

  resetEnd () {
    this.setEndInner(new Date(Date.now() + this._duration));
  }

  setListeners () {
    window.addEventListener('setsessionend', this.setSessionEnd);
    window.addEventListener('resetsession', this.resetEnd);

    if (this.keepalive  > minKeepalive) {
      for (const event of watchableEvents) {
        window.addEventListener(event, this.updateKeepAlive());
      }
    }
  }

  clearListeners () {
    window.removeEventListener('setsessionend', this.setSessionEnd);
    window.removeEventListener('resetsession', this.resetEnd);

    if (this.keepalive > minKeepalive) {
      for (const event of watchableEvents) {
        window.removeEventListener(event, this.updateKeepAlive());
      }
    }
  }

  //  END:  event handlers
  // ======================================================
  // START: DOM builders

  getDOM () {
    this._wrapSpan = document.createElement('span');
    this._wrapSpan.className = 'text-body-md flex gap-x-2 gap-y-1 flex-row';
    this._wrapSpan.setAttribute('aria-live', 'polite');

    this._msgSpan = document.createElement('span');
    this._msgSpan.className = 'uppercase text-grey-600 whitespace-nowrap';
    this._valueSpan = document.createElement('span');
    this._valueSpan.className = 'text-grey-900';
    // this._modal = document.createElement('dialog');

    const tmp = document.createElement('link');
    tmp.setAttribute('rel', 'stylesheet');
    tmp.setAttribute('href', 'tailwind.css');
    tmp.setAttribute('type', 'text/css');

    this._wrapSpan.appendChild(tmp);
    this._wrapSpan.appendChild(this._msgSpan);
    this._wrapSpan.appendChild(this._valueSpan);

    return this._wrapSpan;
  }

  //  END:  DOM builders
  // ======================================================
  // START: standard custom element callbacks

  connectedCallback () {
    if (this.hasAttribute('duration')) {
      this._duration = this.sanitiseDuation(this.getAttribute('duration'));
    }
    if (this.hasAttribute('when')) {
      this._when = this.setEnd(this.getAttribute('when'));
    }
    if (this.hasAttribute('keepalive')) {
      this._keepalive = this.sanitiseDuation(this.getAttribute('keepalive'));
    }

    if (typeof this.when !== 'string' || this.when.trim() === '') {
      this.resetEnd();
    } else {
      this.setEnd(this.when);
    }

    this.setListeners();
    this._timeout = setTimeout(this.updateStrings(this), 1000);
  }

  disconnectedCallback () {
    this.clearListeners();

    if (this._timeout !== null) {
      clearTimeout(this._timeout);
    }
  }

  //  END:  standard custom element callbacks
  // ======================================================

};

customElements.define('session-timeout', SessionTimeout)
