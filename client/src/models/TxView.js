import TxSprite from './TxSprite.js'

const highlightTransitionTime = 300
const hoverGrowTransitionTime = 50
const hoverShrinkTransitionTime = 1000
const lensHaloPadding = 2.25
const lensHaloAlpha = 0.55

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
    this.lensHaloSprite = null
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
      this.bringLensToFront()
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

    if (!this.lensHaloSprite) {
      this.lensHaloSprite = new TxSprite({
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

    this.bringLensToFront()

    this.lensHaloSprite.update({
      x: lens.x,
      y: lens.y,
      r: lens.r + lensHaloPadding,
      h: 0,
      l: 0,
      alpha: lensHaloAlpha,
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
    if ((!this.lensSprite && !this.lensHaloSprite) || !position) return

    const update = {}
    if (position.x != null) update.x = position.x
    if (position.y != null) update.y = position.y
    if (position.r != null) update.r = position.r + this.lensBoost
    if (!Object.keys(update).length) return

    const haloUpdate = { ...update }
    if (haloUpdate.r != null) haloUpdate.r += lensHaloPadding

    if (this.lensHaloSprite) this.lensHaloSprite.update({
      ...haloUpdate,
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
    if (this.hover) this.bringLensToFront()
  }

  refreshHover () {
    if (this.hover) this.bringLensToFront()
  }

  bringLensToFront () {
    if (this.vertexArray && this.vertexArray.moveGroupToFront && this.lensHaloSprite && this.lensSprite) {
      this.vertexArray.moveGroupToFront([this.lensHaloSprite, this.lensSprite])
    } else {
      if (this.lensHaloSprite) this.lensHaloSprite.bringToFront()
      if (this.lensSprite) this.lensSprite.bringToFront()
    }
  }

  destroyLens (duration = 0) {
    if (this.lensDestroyTimer) clearTimeout(this.lensDestroyTimer)
    this.lensDestroyTimer = null
    if (!this.lensSprite && !this.lensHaloSprite) return

    const sprite = this.lensSprite
    const haloSprite = this.lensHaloSprite
    if (duration > 0) {
      const growDelay = Math.max(0, hoverGrowTransitionTime - (performance.now() - this.lensGrowStartedAt))
      if (growDelay > 0) {
        this.lensDestroyTimer = setTimeout(() => {
          this.lensDestroyTimer = null
          if (!this.hover && this.lensSprite === sprite && this.lensHaloSprite === haloSprite) {
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
      if (haloSprite) haloSprite.update({
        r: this.lensBaseRadius + lensHaloPadding,
        alpha: 0,
        duration,
        adjust: false,
        smooth: true
      })
      this.lensDestroyTimer = setTimeout(() => {
        if (this.lensSprite === sprite) this.lensSprite = null
        if (this.lensHaloSprite === haloSprite) this.lensHaloSprite = null
        if (sprite) sprite.destroy()
        if (haloSprite) haloSprite.destroy()
      }, duration + 50)
    } else {
      this.lensSprite = null
      this.lensHaloSprite = null
      if (sprite) sprite.destroy()
      if (haloSprite) haloSprite.destroy()
    }
  }
}
