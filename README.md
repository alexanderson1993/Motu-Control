# MOTU Control

A JavaScript controller for MOTU devices using the HTTP/JSON API. Works in both browsers and NodeJS

## Usage

Install using your package manager of choice:

```bash
yarn add motu-control
```

Then import and initialize it with the HTTP address of the MOTU device:

```javascript
import MOTU from "motu-control";

const motu = new MOTU("http://10.1.53.19");
```

Once initialized, the MOTU instance will automatically long-poll the MOTU device to get updates on the mixers and channels. It currently filters out all but analog inputs and outputs, aux mixers, and mixer groups. All of this information can be accessed from two dynamic (getter) properties on the class:

```javascript
console.log(motu.mixerInputChannels);

// [
//   {
//     defaultName: 'In 1',
//     name: 'Bridge Mic (Front)',
//     src: '0:0',
//     chan: 0,
//     input: {
//       defaultName: 'Analog 1',
//       trimRange: '-96:22',
//       name: 'Bridge Mic 1',
//       trim: 22
//     },
//     type: 'chan',
//     mix: {
//       config: [Object],
//       hpf: [Object],
//       eq: [Object],
//       gate: [Object],
//       comp: [Object],
//       matrix: [Object]
//     }
//   },
//   ...
// ]

console.log(motu.mixerOutputChannels);

// [
//     {
//     defaultName: 'Aux 1',
//     name: 'Bridge L',
//     chan: 0,
//     type: 'aux',
//     mix: { config: [Object], eq: [Object], matrix: [Object], tb: [Object] }
//   },
//   ...
// ]
```

Updating the MOTU is as easy as modifying the values in the `mix` object. This will automatically send the update to the MOTU. Multiple value modifications applied at the same time will be batched into a single request to limit the number of network messages sent.

When setting any of these values, you must only use numerical input; any other type of value will not perform any operation.

```javascript
motu.mixerInputChannels[0].mix.matrix.fader = 0.5;

// A PATCH request is sent to the MOTU, triggering the update.
```

# License

This library is MIT licensed. See LICENSE for more information.
