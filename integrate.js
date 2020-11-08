/*
 * Copyright 2019 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

(function (Nuvola) {
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  const C_ = Nuvola.Translate.pgettext
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction
  const ACTION_LIKE = 'like'

  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)

    Nuvola.actions.addAction('playback', 'win', ACTION_LIKE, C_('Action', 'Like'),
      null, null, null, true)
  }

  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  WebApp._onPageReady = function () {
    player.addExtraActions([ACTION_LIKE])
    Nuvola.actions.connect('ActionActivated', this)
    this.update()
  }

  // Extract data from the web page
  WebApp.update = function () {
    const elms = this._getElements()
    const track = {
      album: null,
      artLocation: null,
      rating: null,
      length: elms.timeTotal ? elms.timeTotal.textContent : null
    }

    const trackInfo = document.querySelectorAll('div[class*="player-PlayerInfo__infoEl"] > span')
    if (trackInfo.length) {
      track.title = trackInfo.length > 2 ? [].slice.call(trackInfo, 2).map(x => x.textContent).join('') || null : null
      track.artist = trackInfo[0].textContent || null
    } else {
      const title = document.querySelectorAll('div[class*="mood-MoodTrackInfo__title"] a > span')
      track.title = [].map.call(title, x => x.textContent).join(' - ')
      track.artist = Nuvola.queryText('div[class*="mood-MoodTrackInfo__composer"]')
    }

    let state
    if (elms.pause) {
      state = PlaybackState.PLAYING
    } else if (elms.play) {
      state = PlaybackState.PAUSED
    } else {
      state = PlaybackState.UNKNOWN
    }

    player.setTrack(track)
    player.setPlaybackState(state)
    player.setTrackPosition(Nuvola.queryText('span[class*="player-PlayerProgress__time"]'))
    player.updateVolume(
      elms.volumeHandle && elms.volumeHandle.style.left && elms.volumeHandle.style.left.endsWith('%')
        ? elms.volumeHandle.style.left.replace('%', '') / 100
        : 1
    )

    player.setCanGoPrev(!!elms.skipback)
    player.setCanGoNext(!!elms.skipforward)
    player.setCanPlay(!!elms.play)
    player.setCanPause(!!elms.pause)
    player.setCanSeek(state !== PlaybackState.UNKNOWN && elms.seekBar)
    player.setCanChangeVolume(!!elms.volumeBar)

    const repeat = this._getRepeat()
    player.setCanRepeat(repeat !== null)
    player.setRepeatState(repeat)

    Nuvola.actions.updateEnabledFlag(ACTION_LIKE, !!elms.heart)
    Nuvola.actions.updateState(ACTION_LIKE, !!elms.heart && elms.heart.className.includes('isActive'))

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    const elms = this._getElements()
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
        if (elms.play) {
          Nuvola.clickOnElement(elms.play)
        } else {
          Nuvola.clickOnElement(elms.pause)
        }
        break
      case PlayerAction.PLAY:
        Nuvola.clickOnElement(elms.play)
        break
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(elms.pause)
        break
      case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(elms.skipback)
        break
      case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(elms.skipforward)
        break
      case PlayerAction.SEEK: {
        const total = Nuvola.parseTimeUsec(elms.timeTotal ? elms.timeTotal.textContent : null)
        if (param >= 0 && param <= total) {
          Nuvola.setInputValueWithEvent(elms.seekBar, param / 1000000)
          Nuvola.clickOnElement(elms.seekBar, param / total, 0.5)
        }
        break
      }
      case PlayerAction.CHANGE_VOLUME:
        Nuvola.clickOnElement(elms.volumeBar, param, 0.5)
        break
      case PlayerAction.REPEAT:
        this._setRepeat(param)
        break
      case ACTION_LIKE:
        Nuvola.clickOnElement(elms.heart)
        break
    }
  }

  WebApp._getElements = function () {
    // Interesting elements
    const elms = this._getButtons(['play', 'pause', 'skipback', 'skipforward', 'repeatall', 'repeatone', 'heart'])
    elms.timeTotal = document.querySelector('span[class*="player-PlayerProgress__timeTotalTime"]')
    elms.seekBar = document.querySelector('input[class*="player-PlayerProgress__input"]')
    elms.volumeBar = document.querySelector('div[class*="player-PlayerVolume__bar"] .rc-slider-rail')
    elms.volumeHandle = document.querySelector('div[class*="player-PlayerVolume__bar"] .rc-slider-handle')
    elms.repeat = elms.repeatone || elms.repeatall

    // Ignore disabled buttons
    for (const key in elms) {
      if (elms[key] && elms[key].disabled) {
        elms[key] = null
      }
    }
    return elms
  }

  WebApp._getButtons = function (names) {
    const buttons = {}
    for (const name of names) {
      buttons[name] = null
    }
    for (const elm of document.getElementsByTagName('use')) {
      let button = elm
      while (button && button.tagName !== 'BUTTON') {
        button = button.parentElement
      }
      if (!button) {
        continue
      }
      const href = elm.getAttribute('xlink:href')
      if (href && href.startsWith('#icon-')) {
        const name = href.substr(6).replace('-', '')
        if (button.className.includes('PlayerControls') || button.className.includes('CollectionButton')) {
          buttons[name] = button
        }
      }
    }
    return buttons
  }

  WebApp._getRepeat = function () {
    const elms = this._getElements()
    if (!elms.repeat) {
      return null
    }
    if (elms.repeatone) {
      return Nuvola.PlayerRepeat.TRACK
    }
    return elms.repeatall.firstElementChild.className.includes('iconInactive')
      ? Nuvola.PlayerRepeat.NONE
      : Nuvola.PlayerRepeat.PLAYLIST
  }

  WebApp._setRepeat = function (repeat) {
    while (this._getRepeat() !== repeat) {
      Nuvola.clickOnElement(this._getElements().repeat)
    }
  }

  WebApp.start()
})(this) // function (Nuvola)
