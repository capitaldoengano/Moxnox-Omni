export class JobQueue {
  #handler
  #onError
  #tail = Promise.resolve()

  constructor(handler, onError = console.error) {
    this.#handler = handler
    this.#onError = onError
  }

  enqueue(item) {
    this.#tail = this.#tail
      .then(() => this.#handler(item))
      .catch((error) => this.#onError(error, item))
    return this.#tail
  }

  async drain() {
    await this.#tail
  }
}

