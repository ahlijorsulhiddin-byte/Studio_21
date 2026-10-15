/**
 * Simple undo/redo stack
 */
window.MPS = window.MPS || {};

MPS.History = class {
  constructor(limit = 40) {
    this.limit = limit;
    this.stack = [];
    this.index = -1;
  }

  push(state) {
    // remove future
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(JSON.parse(JSON.stringify(state)));
    if (this.stack.length > this.limit) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  undo() {
    if (this.index <= 0) return null;
    this.index--;
    return JSON.parse(JSON.stringify(this.stack[this.index]));
  }

  redo() {
    if (this.index >= this.stack.length - 1) return null;
    this.index++;
    return JSON.parse(JSON.stringify(this.stack[this.index]));
  }

  canUndo() { return this.index > 0; }
  canRedo() { return this.index < this.stack.length - 1; }

  clear() {
    this.stack = [];
    this.index = -1;
  }

  get current() {
    return this.index >= 0 ? this.stack[this.index] : null;
  }
};
