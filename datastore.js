const EventEmitter = require("eventemitter3");

class Datastore extends EventEmitter {
  constructor() {
    super();
    this._data = {};
    this._changesQueue = [];
  }

  merge(newData, source = "user") {
    let changes = [];
    for (let key in newData) {
      // Only notify about data that was changed
      if (newData.hasOwnProperty(key) && this._data[key] !== newData[key]) {
        this._data[key] = newData[key];
        changes.push({ key: key, value: newData[key] });
      }
    }
    this._emitChanges(changes, source);
  }

  get(key) {
    return this._data[key];
  }

  set(key, value, source = "user") {
    this._data[key] = value;
    this._changesQueue.push({ key, value, source });
    this._processChangesQueue();
  }

  _onlyUnique(value, index, self) {
    return self.indexOf(value) === index;
  }

  _processChangesQueue() {
    // We use a timeout of 0 to group all changes made synchronous code block
    clearTimeout(this._changesQueueTimeout);
    this._changesQueueTimeout = setTimeout(() => {
      // Generate distinct list of sources
      let sources = this._changesQueue
        .map(o => o.source)
        .filter(this._onlyUnique);

      // Group changes per source
      for (const source of sources) {
        let changesOfSource = this._changesQueue
          .filter(o => o.source === source)
          .map(function(o) {
            return { key: o.key, value: o.value };
          });
        this._emitChanges(changesOfSource, source);
      }

      // Clear the queue
      this._changesQueue = [];
    }, 0);
  }

  _emitChanges(changes, source) {
    if (changes && changes.length) {
      this.emit("changed", changes, source);
    }
  }
}

module.exports = Datastore;
