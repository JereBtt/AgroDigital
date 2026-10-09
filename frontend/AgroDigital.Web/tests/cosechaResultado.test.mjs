import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularKgCosechados, calcularRindeKgHa, formatearEnteroConMiles, parsearEnteroConMiles } from '../src/cosechaResultado.js';

test('calcula el total cosechado desde el rinde y la superficie trabajada', () => {
  assert.equal(calcularKgCosechados('4000', '57.7789'), '231116');
  assert.equal(calcularKgCosechados('4000', ''), '');
});

test('calcula el rinde entero desde el total y la superficie', () => {
  assert.equal(calcularRindeKgHa('231116', '57.7789'), '4000');
  assert.equal(calcularRindeKgHa('', '57.7789'), '');
  assert.equal(calcularRindeKgHa('1000', '0'), '');
});

test('muestra punto de miles y descarta la fracción al ingresar kg o kg/ha', () => {
  assert.equal(formatearEnteroConMiles('23113454'), '23.113.454');
  assert.equal(formatearEnteroConMiles('400033'), '400.033');
  assert.equal(parsearEnteroConMiles('23.113.454'), '23113454');
  assert.equal(parsearEnteroConMiles('400.033,75'), '400033');
  assert.equal(parsearEnteroConMiles(''), '');
});
