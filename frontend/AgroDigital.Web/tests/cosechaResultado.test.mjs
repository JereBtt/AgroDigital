import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularKgCosechados, calcularRindeKgHa } from '../src/cosechaResultado.js';

test('calcula el total cosechado desde el rinde y la superficie trabajada', () => {
  assert.equal(calcularKgCosechados('4000', '57.7789'), '231115.6');
  assert.equal(calcularKgCosechados('4000', ''), '');
});

test('calcula el rinde desde el total y la superficie sin redondear a enteros', () => {
  assert.equal(calcularRindeKgHa('231115.6', '57.7789'), '4000');
  assert.equal(calcularRindeKgHa('', '57.7789'), '');
  assert.equal(calcularRindeKgHa('1000', '0'), '');
});
