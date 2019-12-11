const fetch = require("isomorphic-fetch");
const { unflatten } = require("flat");
const EventEmitter = require("eventemitter3");
const FormData = require("form-data");

class Motu extends EventEmitter {
  constructor(address) {
    super();
    if (!address) throw new Error("Address must be provided");
    this.address = address;

    this._eTagData = -1;
    this._clientId = Math.round(Math.random() * 10000000);
    this._data = {};
    this._changesQueue = [];
    this._updateQueue = {};
    this._updateTimeout = null;

    this._getNewData();
  }

  makeProxyHandler = (path = "") => {
    return {
      get: (target, prop) => {
        if (typeof target[prop] === "object" && target[prop] !== null) {
          return new Proxy(
            target[prop],
            this.makeProxyHandler(`${path}${path ? "/" : ""}${prop}`)
          );
        } else {
          return target[prop];
        }
      },
      set: (target, prop, value) => {
        // Only update number values.
        if (typeof target[prop] === "object") return true;
        if (typeof value !== "number") return true;
        target[prop] = value;
        this.queueUpdate({ path: `${path}/${prop}`, value });
        return true;
      }
    };
  };

  queueUpdate({ path, value }) {
    this._updateQueue = { ...this._updateQueue, [path]: value };
    if (!this._updateTimeout) {
      // Use the timeout to allow multiple updates to be applied
      // in the same tick
      this._updateTimeout = setTimeout(() => this.performUpdate(), 0);
    }
  }

  performUpdate(updates = {}) {
    const allUpdates = { ...this._updateQueue, ...updates };
    this._updateTimeout = null;
    this._matrixPost(allUpdates);
  }

  get mixerInputChannels() {
    if (Object.keys(this._data).length === 0) return [];
    const deepData = unflatten(this._data, { delimiter: "/" });
    const { obank, ibank } = deepData.ext;
    const inputMixers = obank.find(o => o.name === "Mix In");
    const mixerInputChannels = inputMixers.ch
      .filter(m => m.src)
      .map((m, key) => {
        const [device, channel] = m.src.split(":");
        const input = ibank[device].ch[channel];
        const { config } = deepData.mix.chan[key];
        let name = m.name || input.name || input.defaultName;

        console.log(config);
        // For stereo channel, rename them to remove indication of the left channel
        if (config.format === "2:0") {
          name = name.replace(" L", "").replace(" Left", "");
        }
        // Don't display the right channel for stereo channels at all.
        // This mimics the behavior of the MOTU and simplified the UI.
        // The MOTU uses the left channel's settings for the right channel
        // automatically.
        if (config.format === "2:1") return null;
        return {
          ...m,
          chan: key,
          input,
          type: "chan",
          mix: new Proxy(
            deepData.mix.chan[key],
            this.makeProxyHandler(`mix/chan/${key}`)
          ),
          name
        };
      })
      .filter(Boolean);
    return mixerInputChannels;
  }

  get mixerOutputChannels() {
    if (Object.keys(this._data).length === 0) return [];
    const deepData = unflatten(this._data, { delimiter: "/" });
    const { ibank } = deepData.ext;

    const outputAux = ibank.find(o => o.name === "Mix Aux");
    const outputGroups = ibank.find(o => o.name === "Mix Group");

    const mixerOutputChannels = outputAux.ch
      .map((m, key) => {
        return {
          ...m,
          chan: key,
          type: "aux",
          mix:
            deepData.mix.aux[key] &&
            new Proxy(
              deepData.mix.aux[key],
              this.makeProxyHandler(`mix/aux/${key}`)
            )
        };
      })
      .concat(
        outputGroups.ch.map((m, key) => {
          return {
            ...m,
            chan: key,
            type: "group",
            mix:
              deepData.mix.group[key] &&
              new Proxy(
                deepData.mix.group[key],
                this.makeProxyHandler(`mix/group/${key}`)
              )
          };
        })
      )
      .map(m => {
        const config = m && m.mix && m.mix.config;
        let name = m.name;
        // For stereo channel, rename them to remove indication of the left channel
        if ((config && config.format === "2:0") || m.type === "group") {
          name = name.replace(" L", "").replace(" Left", "");
        }
        // Don't display the right channel for stereo channels at all.
        // This mimics the behavior of the MOTU and simplified the UI.
        // The MOTU uses the left channel's settings for the right channel
        // automatically.
        if (config && config.format === "2:1") return null;
        return {
          ...m,
          name
        };
      })
      .filter(m => m && m.name && m.mix);

    return mixerOutputChannels;
  }

  _matrixPost(parameters) {
    const body = new FormData();
    body.append("json", JSON.stringify(parameters));
    fetch(`${this.address}/datastore?client=${this._clientId}`, {
      method: "PATCH",
      headers: { connection: "keep-alive" },
      body
    })
      .then(res => {
        if (res.status < 200 || res.status > 299) {
          console.log(
            "Error updating audio matrix: " + this.address,
            parameters,
            res.status
          );
        }
      })
      .catch(err => {
        console.log(err);
        if (err) {
          console.log(
            "Error updating audio matrix: " + this.address,
            parameters,
            err
          );
        }
      });
  }

  _refreshData() {
    setTimeout(() => {
      this._getNewData();
    }, 0);
  }

  _getNewData() {
    if (!this.address) {
      return;
    }
    const path = "/datastore?client=" + this._clientId;
    let headers = {};
    if (this._eTagData > 0) {
      // MOTU supports long polling:
      // It waits to send response until something has changed, and increases the ETag number.
      headers["If-None-Match"] = this._eTagData;
    }
    fetch(`${this.address}${path}`, { headers })
      .then(response => {
        if (response.status >= 200 && response.status < 300) {
          this._eTagData = response.headers.get("etag");
          return response.json();
        } else if (response.status === 304) {
          // 304 means no data has changed on the device, ask again
          this._refreshData();
          return null;
        } else {
          console.log("Unexpected http status " + response.status);
          setTimeout(() => {
            this._getNewData();
          }, 1000 * 10);
          return null;
        }
      })
      .then(body => {
        if (body) {
          this.merge(body);
          this._refreshData();
        }
      })
      .catch(err => {
        console.log("Unexpected error", err);
        setTimeout(() => {
          this._getNewData();
        }, 1000 * 10);
      });
  }

  // Datastore Stuff
  merge(newData) {
    let changes = [];
    for (let key in newData) {
      // Only notify about data that was changed
      if (newData.hasOwnProperty(key) && this._data[key] !== newData[key]) {
        this._data[key] = newData[key];
        changes.push({ key: key, value: newData[key] });
      }
    }
    this._emitChanges(changes);
  }

  _emitChanges(changes) {
    if (changes && changes.length) {
      this.emit("changed", changes);
    }
  }
}

module.exports = Motu;
