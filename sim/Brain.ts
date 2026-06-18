// 5 → 6 → 2 fully-connected network, tanh activations
// Weight layout (50 values total):
//   W1 [0..29]  : 5×6 input→hidden, row-major (input i, hidden j → i*6+j)
//   b1 [30..35] : 6 hidden biases
//   W2 [36..47] : 6×2 hidden→output, row-major (hidden j, output k → 36+j*2+k)
//   b2 [48..49] : 2 output biases

export const BRAIN_INPUT  = 5
export const BRAIN_HIDDEN = 6
export const BRAIN_OUTPUT = 2
export const BRAIN_SIZE =
  BRAIN_INPUT * BRAIN_HIDDEN +   // W1: 30
  BRAIN_HIDDEN +                  // b1: 6
  BRAIN_HIDDEN * BRAIN_OUTPUT +   // W2: 12
  BRAIN_OUTPUT                    // b2: 2
// = 50

const W1_OFF = 0
const B1_OFF = BRAIN_INPUT * BRAIN_HIDDEN          // 30
const W2_OFF = B1_OFF + BRAIN_HIDDEN               // 36
const B2_OFF = W2_OFF + BRAIN_HIDDEN * BRAIN_OUTPUT // 48

// Reused hidden-layer scratch: the network runs once per foraging prey per tick
// on a single thread and the buffer is fully overwritten before it's read, so a
// module-level scratch avoids allocating a 6-element array on every call.
const HIDDEN_SCRATCH = new Array<number>(BRAIN_HIDDEN)

export function brainForward(weights: number[], inputs: number[]): [number, number] {
  const hidden = HIDDEN_SCRATCH
  for (let j = 0; j < BRAIN_HIDDEN; j++) {
    let s = weights[B1_OFF + j]
    for (let i = 0; i < BRAIN_INPUT; i++) {
      s += inputs[i] * weights[W1_OFF + i * BRAIN_HIDDEN + j]
    }
    hidden[j] = Math.tanh(s)
  }

  const out: [number, number] = [0, 0]
  for (let k = 0; k < BRAIN_OUTPUT; k++) {
    let s = weights[B2_OFF + k]
    for (let j = 0; j < BRAIN_HIDDEN; j++) {
      s += hidden[j] * weights[W2_OFF + j * BRAIN_OUTPUT + k]
    }
    out[k] = Math.tanh(s)
  }

  return out
}
