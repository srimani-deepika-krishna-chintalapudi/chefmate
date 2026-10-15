
(() => {
  const CM = (window.ChefMate = window.ChefMate || {});

  const ok = (action, message) => {
    console.debug('[YOUTUBE] Action:', action, message);
    return { success: true, action, message };
  };

  const fail = (action, message) => {
    console.debug('[YOUTUBE] Action failed:', action, message);
    return { success: false, action, message };
  };

  CM.youtubeController = {
    getVideo() {
      return document.querySelector('video.html5-main-video, video');
    },

    isPlaying() {
      const v = this.getVideo();
      return Boolean(v && !v.paused && !v.ended);
    },

    async play() {
      const v = this.getVideo();
      if (!v) return fail('PLAY', 'No YouTube video is available.');

      try {
        const p = v.play();
        if (p && typeof p.then === 'function') {
          await p.catch(err => {
            console.warn('[CHEFMATE FLOW] Playback promise rejected (AbortError handled safely):', err.name, err.message);
            return null;
          });
        }
        return ok('PLAY', 'Video playing.');
      } catch (err) {
        console.warn('[CHEFMATE FLOW] Video play caught error:', err);
        return fail('PLAY', 'YouTube prevented playback. Click the video once, then try again.');
      }
    },

    pause() {
      const v = this.getVideo();
      if (!v) return fail('PAUSE', 'No YouTube video is available.');

      v.pause();
      return v.paused
        ? ok('PAUSE', 'Video paused.')
        : fail('PAUSE', 'YouTube did not pause the video.');
    },

    async togglePlay() {
      return this.isPlaying() ? this.pause() : this.play();
    },

    async replay() {
      const v = this.getVideo();
      if (!v) return fail('REPLAY', 'No YouTube video is available.');

      v.currentTime = 0;
      const result = await this.play();

      return result.success
        ? ok('REPLAY', 'Video replaying from the beginning.')
        : result;
    },

    seekForward(seconds) {
      return this.seek(seconds, 'SEEK_FORWARD', `Forwarded ${seconds} seconds.`);
    },

    seekBackward(seconds) {
      return this.seek(-seconds, 'SEEK_BACKWARD', `Rewound ${seconds} seconds.`);
    },

    seek(delta, action, message) {
      const v = this.getVideo();
      if (!v) return fail(action, 'No YouTube video is available.');

      v.currentTime = Math.max(
        0,
        Math.min(
          Number.isFinite(v.duration) ? v.duration : Infinity,
          v.currentTime + delta
        )
      );

      return ok(action, message);
    },

    scrollUp() {
      window.scrollBy({ top: -600, behavior: 'smooth' });
      return ok('SCROLL_UP', 'YouTube page scrolled up.');
    },

    scrollDown() {
      window.scrollBy({ top: 600, behavior: 'smooth' });
      return ok('SCROLL_DOWN', 'YouTube page scrolled down.');
    },

    setVolume(value) {
      const v = this.getVideo();
      if (!v) return fail('SET_VOLUME', 'No YouTube video is available.');

      v.muted = false;
      v.volume = Math.max(0, Math.min(1, value));

      return ok('SET_VOLUME', `Volume set to ${Math.round(v.volume * 100)}%.`);
    },

    increaseVolume() {
      const v = this.getVideo();
      return v
        ? this.setVolume(v.volume + 0.1)
        : fail('VOLUME_UP', 'No YouTube video is available.');
    },

    decreaseVolume() {
      const v = this.getVideo();
      return v
        ? this.setVolume(v.volume - 0.1)
        : fail('VOLUME_DOWN', 'No YouTube video is available.');
    },

    mute() {
      const v = this.getVideo();
      if (!v) return fail('MUTE', 'No YouTube video is available.');

      v.muted = true;

      return v.muted
        ? ok('MUTE', 'Video muted.')
        : fail('MUTE', 'YouTube did not mute the video.');
    },

    unmute() {
      const v = this.getVideo();
      if (!v) return fail('UNMUTE', 'No YouTube video is available.');

      v.muted = false;

      return !v.muted
        ? ok('UNMUTE', 'Video unmuted.')
        : fail('UNMUTE', 'YouTube did not unmute the video.');
    },

    setPlaybackRate(rate) {
      const v = this.getVideo();
      if (!v) return fail('SET_SPEED', 'No YouTube video is available.');

      v.playbackRate = rate;
      return ok('SET_SPEED', `Playback speed set to ${rate}×.`);
    },

    async fullscreen() {
      const target =
        document.querySelector('#movie_player, .html5-video-player') ||
        this.getVideo();

      if (!target?.requestFullscreen) {
        return fail('FULLSCREEN', 'Fullscreen is unavailable.');
      }

      try {
        await target.requestFullscreen();
        return ok('FULLSCREEN', 'Fullscreen enabled.');
      } catch {
        return fail('FULLSCREEN', 'Fullscreen was unavailable.');
      }
    },

    async exitFullscreen() {
      if (!document.fullscreenElement) {
        return ok('EXIT_FULLSCREEN', 'Fullscreen is already off.');
      }

      try {
        await document.exitFullscreen();
        return ok('EXIT_FULLSCREEN', 'Exited fullscreen.');
      } catch {
        return fail('EXIT_FULLSCREEN', 'Could not exit fullscreen.');
      }
    },

    async skipAd() {
      const player = document.querySelector('#movie_player');

      if (!player) {
        return fail('SKIP_AD', 'YouTube player was not found.');
      }

      if (!player.classList.contains('ad-showing')) {
        return fail('SKIP_AD', 'No YouTube ad is currently playing.');
      }

      const selectors = [
        '.ytp-ad-skip-button-modern',
        '.ytp-ad-skip-button',
        '.ytp-skip-ad-button'
      ];

      const isVisible = element => {
        if (!(element instanceof HTMLElement)) return false;

        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      const button = selectors
        .flatMap(selector => [...player.querySelectorAll(selector)])
        .find(element => {
          if (!isVisible(element) || element.matches(':disabled')) {
            return false;
          }

          const label = [
            element.innerText,
            element.getAttribute('aria-label'),
            element.getAttribute('title')
          ].filter(Boolean).join(' ');

          return /skip/i.test(label);
        });

      if (!button) {
        return fail(
          'SKIP_AD',
          'The ad is playing, but a recognizable Skip Ad button was not found.'
        );
      }

      console.debug('[YOUTUBE] Skip button found:', button);

      button.click();

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!player.isConnected) {
        return fail('SKIP_AD', 'YouTube changed the player; please check playback.');
      }

      const adStillPlaying = player.classList.contains('ad-showing');
      const buttonStillVisible = isVisible(button);

      if (!adStillPlaying) {
        return ok('SKIP_AD', 'YouTube reports that the ad has ended.');
      }

      if (!buttonStillVisible) {
        return fail(
          'SKIP_AD',
          'The Skip Ad button disappeared, but the ad has not been confirmed as skipped.'
        );
      }

      return fail(
        'SKIP_AD',
        'The click did not skip the ad. YouTube may require a direct user interaction.'
      );
    },

    toggleCaptions(enabled) {
      const button = document.querySelector('.ytp-subtitles-button');

      if (!button) {
        return fail(
          enabled ? 'ENABLE_CAPTIONS' : 'DISABLE_CAPTIONS',
          'Captions are not available for this video.'
        );
      }

      if ((button.getAttribute('aria-pressed') === 'true') !== enabled) {
        button.click();
      }

      return ok(
        enabled ? 'ENABLE_CAPTIONS' : 'DISABLE_CAPTIONS',
        `Captions ${enabled ? 'enabled' : 'disabled'}.`
      );
    },

    nextVideo() {
      const button = document.querySelector('.ytp-next-button, a.ytp-next-button');

      if (!button) {
        return fail('NEXT', 'I could not find YouTube’s next-video control.');
      }

      button.click();
      return ok('NEXT', 'Next video requested.');
    },

    seekTo(seconds) {
      const v = this.getVideo();
      if (!v) return fail('SEEK', 'No YouTube video is available.');
      v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : Infinity, seconds));
      return ok('SEEK', `Jumped to ${Math.floor(seconds)}s.`);
    },

    getVideoId() {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('v')) return url.searchParams.get('v');
        const match = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (match) return match[1];
      } catch (_) {}
      return '';
    },

    getVideoDescription() {
      // 1. Try to expand description if collapsed to ensure full text is loaded
      const expandBtn = document.querySelector(
        '#description-inline-expander #expand, ytd-text-inline-expander #expand, #description #expand'
      );
      if (expandBtn && expandBtn.offsetParent !== null) {
        try { expandBtn.click(); } catch (_) {}
      }

      // 2. Query description containers
      const selectors = [
        '#description-inline-expander yt-formatted-string',
        'ytd-text-inline-expander#description-inline-expander',
        '#description.ytd-watch-metadata yt-formatted-string',
        '#description-inline-expander',
        'ytd-expandable-video-description-body-renderer',
        '#description yt-formatted-string'
      ];

      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent && el.textContent.trim().length > 15) {
          return el.textContent.trim();
        }
      }

      return '';
    },

    search(query) {
      if (!query || !query.trim()) return fail('SEARCH', 'Search query was empty.');
      const q = encodeURIComponent(query.trim());
      window.location.href = `https://www.youtube.com/results?search_query=${q}`;
      return ok('SEARCH', `Searching YouTube for "${query.trim()}".`);
    },

    previousVideo() {
      const prevButton = document.querySelector('.ytp-prev-button, a.ytp-prev-button');
      if (prevButton && prevButton.offsetParent !== null) {
        prevButton.click();
        return ok('PREVIOUS', 'Previous playlist video requested.');
      }
      if (window.history.length > 1) {
        window.history.back();
        return ok('PREVIOUS', 'Navigating to previous video in history.');
      }
      return fail(
        'PREVIOUS',
        'No previous video found in playlist or browser history.'
      );
    },

    currentVideo() {
      const v = this.getVideo();

      return {
        id: this.getVideoId(),
        title:
          document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim() ||
          document.querySelector('h1.title yt-formatted-string')?.textContent?.trim() ||
          document.title.replace(/ - YouTube$/, '').trim(),
        description: this.getVideoDescription(),
        time: v ? Math.floor(v.currentTime) : null
      };
    }
  };
})();
