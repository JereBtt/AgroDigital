import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import useWorkspaceContext from './useWorkspaceContext.js';

function getContext(overrides = {}) {
  let result;
  function Probe() {
    result = useWorkspaceContext({
      session: { role: 'EmpleadoCampo' },
      managerContext: null,
      misEmpresas: [],
      selectedParentEmpresaId: '',
      parentCampanias: [],
      selectedParentCampaniaId: '',
      lotes: [],
      ...overrides
    });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

test('los permisos siguen el rol del usuario en la empresa elegida', () => {
  const empresas = [
    { empresaId: 1, activo: true, rol: 'Encargado' },
    { empresaId: 2, activo: true, rol: 'EmpleadoAdministrativo' }
  ];
  const encargado = getContext({ misEmpresas: empresas, selectedParentEmpresaId: '1' });
  assert.equal(encargado.permisosRol.estructura, true);
  assert.equal(encargado.permisosRol.registroCampo, true);

  const administrativo = getContext({ misEmpresas: empresas, selectedParentEmpresaId: '2' });
  assert.equal(administrativo.permisosRol.estructura, false);
  assert.equal(administrativo.permisosRol.registroCampo, false);
  assert.equal(administrativo.permisosRol.movimientoGrano, true);
});

test('el contexto filtra los lotes por empresa y conserva la selección de campaña', () => {
  const context = getContext({
    misEmpresas: [{ empresaId: 2, activo: true, rol: 'EmpleadoCampo' }],
    selectedParentEmpresaId: '2',
    parentCampanias: [
      { campaniaId: 8, empresaId: 2, fechaInicio: '2026-06-01' },
      { campaniaId: 9, empresaId: 1, fechaInicio: '2026-06-01' }
    ],
    selectedParentCampaniaId: '8',
    lotes: [{ loteId: 1, empresaId: 1 }, { loteId: 2, empresaId: 2 }]
  });
  assert.equal(context.selectedParentCampania?.campaniaId, 8);
  assert.deepEqual(context.parentFilteredLotes.map((lote) => lote.loteId), [2]);
});
