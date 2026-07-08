import TxSprite from './TxSprite.js'

const highlightTransitionTime = 300
const hoverGrowTransitionTime = 50
const hoverShrinkTransitionTime = 1000
const glowPadding = 2.25
const glowAlpha = 0.55

// converts from this class's update format to TxSprite's update format
// now, id, value, position, size, color, alpha, duration, adjust
function toSpriteUpdate(display, duration, minDuration, delay, start, adjust, smooth, boomerang) {
  return {
    now: (start || performance.now()),
    delay: delay,
    duration: duration,
    minDuration: minDuration,
    ...(display.position ? display.position: {}),
    ...(display.color ? display.color: {}),
    adjust,
    smooth,
    boomerang
  }
}

export default class TxView {
  constructor ({ id, time, value, vbytes, vertexArray }) {
    this.id = id
    this.time = time
    this.value = value
    this.vbytes = vbytes
    this.initialised = false
    this.vertexArray = vertexArray

    this.hover = false
    this.highlight = false
    this.lensSprite = null
    this.lensGlowSprite = null
    this.lensDestroyTimer = null
    this.lensBaseRadius = 0
    this.lensBoost = 0
    this.lensGrowStartedAt = 0
  }

  destroy () {
    this.destroyLens()
    if (this.sprite) {
      this.sprite.destroy()
      this.sprite = null
    }
  }

  /*
    display: defines the final appearance of the sprite
        position: { x, y }
        size: in pixels
        color:
            i: x coord in color texture
            j: y coord in color texture
            alpha: alpha transparency
    duration: of the tweening animation from the previous display state
    delay: for queued transitions, how long to wait after current transition
           completes to start.
  */
  update ({ display, duration, minDuration, delay = 0, jitter, state, start, adjust, smooth, boomerang }) {
    this.state = state
    if (jitter) delay += (Math.random() * jitter)

    if (!this.initialised || !this.sprite) {
      this.initialised = true
      this.sprite = new TxSprite(
        toSpriteUpdate(display, duration, minDuration, delay, start, adjust, smooth, boomerang),
        this.vertexArray
      )
      // apply any pending modifications
      if (this.highlight) {
        this.sprite.update({
          ...this.highlightColor,
          duration: highlightTransitionTime,
          adjust: false,
          modify: true
        })
      }
    } else {
      this.sprite.update(
        toSpriteUpdate(display, duration, minDuration, delay, start, adjust, smooth, boomerang)
      )
    }
    this.updateLensPosition(display && display.position, duration, delay, start, adjust, smooth)
  }

  setHover (hoverOn, color, lens = null) {
    if (hoverOn) {
      this.hover = true
      if (this.sprite) {
        this.sprite.bringToFront()
      }
      this.showLens(lens)
    } else {
      this.hover = false
      this.destroyLens(hoverShrinkTransitionTime)
      if (this.highlight) {
        if (this.sprite) {
          this.sprite.update({
            ...this.highlightColor,
            duration: highlightTransitionTime,
            adjust: false,
            modify: true
          })
        }
      } else {
        if (this.sprite) this.sprite.resume(highlightTransitionTime)
      }
    }
  }

  setHighlight (highlightOn, color) {
    if (highlightOn) {
      this.highlight = true
      this.highlightColor = color
      if (this.sprite) this.sprite.bringToFront()
      if (!this.hover) {
        if (this.sprite) {
          this.sprite.update({
            ...this.highlightColor,
            duration: highlightTransitionTime,
            adjust: false,
            modify: true
          })
        }
      }
      if (this.lensGlowSprite) this.lensGlowSprite.bringToFront()
      if (this.lensSprite) this.lensSprite.bringToFront()
    } else {
      this.highlight = false
      this.highlightColor = null
      if (!this.hover) {
        if (this.sprite) this.sprite.resume(highlightTransitionTime)
      }
    }
  }

  getPosition () {
    if (this.initialised && this.sprite) return this.sprite.getPosition()
  }

  showLens (lens) {
    if (!lens || !this.vertexArray || !this.sprite) return
    const display = this.sprite.getDisplay()

    this.lensBoost = lens.r - lens.baseR
    this.lensBaseRadius = lens.baseR
    this.lensGrowStartedAt = performance.now()
    if (this.lensDestroyTimer) clearTimeout(this.lensDestroyTimer)
    this.lensDestroyTimer = null

    if (!this.lensGlowSprite) {
      this.lensGlowSprite = new TxSprite({
        x: lens.x,
        y: lens.y,
        r: lens.baseR,
        h: 0,
        l: 0,
        alpha: 0
      }, this.vertexArray, false)
    }

    if (!this.lensSprite) {
      this.lensSprite = new TxSprite({
        x: lens.x,
        y: lens.y,
        r: lens.baseR,
        h: display.h,
        l: display.l,
        alpha: 0
      }, this.vertexArray, false)
    }

    this.lensGlowSprite.bringToFront()
    this.lensSprite.bringToFront()

    this.lensGlowSprite.update({
      x: lens.x,
      y: lens.y,
      r: lens.r + glowPadding,
      h: 0,
      l: 0,
      alpha: glowAlpha,
      duration: hoverGrowTransitionTime,
      adjust: false,
      smooth: true
    })

    this.lensSprite.update({
      x: lens.x,
      y: lens.y,
      r: lens.r,
      h: display.h,
      l: display.l,
      alpha: display.alpha,
      duration: hoverGrowTransitionTime,
      adjust: false,
      smooth: true
    })
  }

  updateLensPosition (position, duration, delay, start, adjust, smooth) {
    if ((!this.lensSprite && !this.lensGlowSprite) || !position) return

    const update = {}
    if (position.x != null) update.x = position.x
    if (position.y != null) update.y = position.y
    if (position.r != null) update.r = position.r + this.lensBoost
    if (!Object.keys(update).length) return

    const glowUpdate = { ...update }
    if (glowUpdate.r != null) glowUpdate.r += glowPadding

    if (this.lensGlowSprite) this.lensGlowSprite.update({
      ...glowUpdate,
      start,
      duration,
      delay,
      adjust,
      smooth
    })

    if (this.lensSprite) this.lensSprite.update({
      ...update,
      start,
      duration,
      delay,
      adjust,
      smooth
    })
  }

  destroyLens (duration = 0) {
    if (this.lensDestroyTimer) clearTimeout(this.lensDestroyTimer)
    this.lensDestroyTimer = null
    if (!this.lensSprite && !this.lensGlowSprite) return

    const sprite = this.lensSprite
    const glowSprite = this.lensGlowSprite
    if (duration > 0) {
      const growDelay = Math.max(0, hoverGrowTransitionTime - (performance.now() - this.lensGrowStartedAt))
      if (growDelay > 0) {
        this.lensDestroyTimer = setTimeout(() => {
          this.lensDestroyTimer = null
          if (!this.hover && this.lensSprite === sprite && this.lensGlowSprite === glowSprite) {
            this.destroyLens(duration)
          }
        }, growDelay)
        return
      }
      if (sprite) sprite.update({
        r: this.lensBaseRadius,
        alpha: 0,
        duration,
        adjust: false,
        smooth: true
      })
      if (glowSprite) glowSprite.update({
        r: this.lensBaseRadius + glowPadding,
        alpha: 0,
        duration,
        adjust: false,
        smooth: true
      })
      this.lensDestroyTimer = setTimeout(() => {
        if (this.lensSprite === sprite) this.lensSprite = null
        if (this.lensGlowSprite === glowSprite) this.lensGlowSprite = null
        if (sprite) sprite.destroy()
        if (glowSprite) glowSprite.destroy()
      }, duration + 50)
    } else {
      this.lensSprite = null
      this.lensGlowSprite = null
      if (sprite) sprite.destroy()
      if (glowSprite) glowSprite.destroy()
    }
  }
}
