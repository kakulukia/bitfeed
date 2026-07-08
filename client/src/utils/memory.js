/*
  Utility class for access and management of low-level sprite data

  Maintains a single Float32Array of sprite data, keeping track of empty slots
  to allow constant-time insertion and deletion

  Automatically resizes by copying to a new, larger Float32Array when necessary,
  or compacting into a smaller Float32Array when there's space to do so.
*/
export class FastVertexArray {
  constructor (length, stride, counter) {
    // console.log(`Creating Fast Vertex Array with length ${length} and stride ${stride} `)
    this.length = length
    this.counter = counter
    this.count = 0
    this.stride = stride
    this.sprites = []
    this.data = new Float32Array(this.length * this.stride)
    this.freeSlots = []
    this.lastSlot = 0
    this.nullSprite = new Float32Array(this.stride)
    // this.print()
  }

  print () {
    // console.log(`Length: ${this.length}, Free slots: ${this.freeSlots.length}, last slot: ${this.lastSlot}`)
    // console.log(this.freeSlots)
    // console.log(this.data)
  }

  insert (sprite, counted = true) {
    // console.log('inserting into FVA')
    if (counted) {
      this.count++
      if (this.counter) this.counter.increment()
    }

    let position
    if (this.freeSlots.length) {
      position = this.freeSlots.shift()
    } else {
      position = this.lastSlot
      this.lastSlot++
      if (this.lastSlot > this.length) {
        this.expand()
      }
    }
    // this.print()
    this.sprites[position] = sprite
    return position
  }

  remove (index, counted = true) {
    if (counted) {
      this.count--
      if (this.counter) this.counter.decrement()
    }
    this.setData(index, this.nullSprite)
    this.freeSlots.push(index)
    this.sprites[index] = null
    if (this.length > 2048 && this.count < (this.length * 0.4)) this.compact()
    // this.print()
  }

  setData (index, dataChunk) {
    // console.log(`Updating chunk at ${index} (${index * this.stride})`)
    this.data.set(dataChunk, (index * this.stride))
    // this.print()
  }

  moveToFront (index) {
    const sprite = this.sprites[index]
    if (!sprite) return index

    let target = this.lastSlot - 1
    while (target > index && !this.sprites[target]) target--
    if (target <= index) return index

    const other = this.sprites[target]
    this.sprites[target] = sprite
    this.sprites[index] = other
    sprite.moveVertexPointer(target)
    other.moveVertexPointer(index)
    sprite.compile()
    other.compile()
    return target
  }

  moveGroupToFront (sprites) {
    const group = sprites.filter(sprite => (
      sprite &&
      sprite.vertexPointer != null &&
      this.sprites[sprite.vertexPointer] === sprite
    ))
    if (!group.length) return null

    const groupSet = new Set(group)
    const targetSlots = []
    for (let index = this.lastSlot - 1; index >= 0 && targetSlots.length < group.length; index--) {
      if (this.sprites[index]) targetSlots.unshift(index)
    }

    const targetSet = new Set(targetSlots)
    const sourceSlots = group.map(sprite => sprite.vertexPointer)
    const displaced = targetSlots
      .map(slot => this.sprites[slot])
      .filter(sprite => sprite && !groupSet.has(sprite))
    const vacatedSlots = sourceSlots.filter(slot => !targetSet.has(slot))
    if (displaced.length !== vacatedSlots.length) return null

    const moves = [
      ...displaced.map((sprite, index) => [sprite, vacatedSlots[index]]),
      ...group.map((sprite, index) => [sprite, targetSlots[index]])
    ]

    moves.forEach(([sprite, slot]) => {
      this.sprites[slot] = sprite
    })
    moves.forEach(([sprite, slot]) => {
      if (sprite.vertexPointer !== slot) {
        sprite.moveVertexPointer(slot)
        sprite.compile()
      }
    })

    return targetSlots[targetSlots.length - 1]
  }

  getData (index) {
    return this.data.subarray(index, this.stride)
  }

  expand () {
    // console.log('Expanding FVA')
    this.length *= 2
    const newData = new Float32Array(this.length * this.stride)
    newData.set(this.data)
    this.data = newData
    this.print()
  }

  compact () {
    // console.log('Compacting FVA')
    // console.log(this.sprites)
    // New array length is the smallest power of 2 larger than the sprite count (but no smaller than 512)
    const newLength = Math.max(512, Math.pow(2, Math.ceil(Math.log2(this.count))))
    if (this.newLength != this.length) {
      // console.log(`compacting from ${this.length} to ${newLength}`)
      this.length = newLength
      this.data = new Float32Array(this.length * this.stride)
      let sprite
      const newSprites = []
      let i = 0
      for (var index in this.sprites) {
        sprite = this.sprites[index]
        if (sprite) {
          newSprites.push(sprite)
          sprite.moveVertexPointer(i)
          sprite.compile()
          i++
        }
      }
      this.sprites = newSprites
      this.freeSlots = []
      this.lastSlot = i
    }
    this.print()
  }

  getVertexData () {
    return this.data
  }
}
