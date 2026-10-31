import { useMemo } from 'react';

export default function useWorkspaceContext({ session, managerContext, misEmpresas, selectedParentEmpresaId, parentCampanias, selectedParentCampaniaId, lotes }) {
  const empresasDisponibles = useMemo(
    () => (session?.role === 'Gerente' ? managerContext?.empresas ?? [] : misEmpresas).filter((empresa) => empresa.activo),
    [managerContext, misEmpresas, session?.role]
  );

  // Rol del usuario en la empresa seleccionada (puede ser distinto en cada empresa) y permisos
  // de la matriz de roles. La API valida lo mismo: aca solo se ocultan los botones que no corresponden.
  const rolEmpresaActual = useMemo(() => {
    if (session?.role === 'Admin' || session?.role === 'Gerente') return session.role;
    const empresa = misEmpresas.find((item) => String(item.empresaId) === String(selectedParentEmpresaId));
    return empresa?.rol ?? session?.role ?? '';
  }, [session?.role, misEmpresas, selectedParentEmpresaId]);

  const permisosRol = useMemo(() => ({
    rol: rolEmpresaActual,
    estructura: ['Admin', 'Gerente', 'Encargado'].includes(rolEmpresaActual),
    registroCampo: ['Admin', 'Gerente', 'Encargado', 'EmpleadoCampo'].includes(rolEmpresaActual),
    movimientoGrano: ['Admin', 'Gerente', 'Encargado', 'EmpleadoAdministrativo'].includes(rolEmpresaActual)
  }), [rolEmpresaActual]);
  const selectedParentEmpresa = useMemo(
    () => empresasDisponibles.find((empresa) => String(empresa.empresaId) === String(selectedParentEmpresaId)) ?? null,
    [empresasDisponibles, selectedParentEmpresaId]
  );
  const campaniasDisponibles = useMemo(() => {
    const unique = new Map();
    parentCampanias.forEach((item) => {
      if (!item?.campaniaId || unique.has(item.campaniaId)) return;
      unique.set(item.campaniaId, item);
    });

    return [...unique.values()]
      .filter((campania) => !selectedParentEmpresaId || String(campania.empresaId) === String(selectedParentEmpresaId))
      .sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
  }, [parentCampanias, selectedParentEmpresaId]);
  const selectedParentCampania = useMemo(
    () => campaniasDisponibles.find((campania) => String(campania.campaniaId) === String(selectedParentCampaniaId)) ?? null,
    [campaniasDisponibles, selectedParentCampaniaId]
  );
  const selectedParentCampaniaCombinaciones = useMemo(
    () => parentCampanias.filter((campania) => String(campania.campaniaId) === String(selectedParentCampaniaId)),
    [parentCampanias, selectedParentCampaniaId]
  );
  const empresaDestinoNuevoLoteId = useMemo(() => (
    selectedParentEmpresaId || (empresasDisponibles.find((empresa) => empresa.esPrincipal)?.empresaId
      ?? empresasDisponibles[0]?.empresaId
      ?? '')
  ), [empresasDisponibles, selectedParentEmpresaId]);
  const activeCampaignsByEmpresa = useMemo(() => {
    const campaigns = new Map();
    const today = new Date();
    const currentStartYear = today.getMonth() >= 5 ? today.getFullYear() : today.getFullYear() - 1;
    const currentPeriod = `${currentStartYear}-${currentStartYear + 1}`;

    parentCampanias
      .forEach((item) => {
        if (!item?.campaniaId) return;
        const current = campaigns.get(item.campaniaId) ?? {
          campaniaId: item.campaniaId,
          empresaId: item.empresaId,
          nombre: item.campaniaNombre,
          periodo: item.periodo,
          fechaInicio: item.fechaInicio,
          combinaciones: []
        };
        current.combinaciones.push(item);
        campaigns.set(item.campaniaId, current);
      });

    return [...campaigns.values()]
      .filter((campania) => campania.periodo === currentPeriod && campania.combinaciones.some((item) => item.estado !== 'Finalizado' && lotes.some((lote) => String(lote.loteId) === String(item.loteId) && lote.activo)))
      .reduce((result, campania) => {
        const existing = result.get(String(campania.empresaId));
        if (!existing || new Date(campania.fechaInicio) > new Date(existing.fechaInicio)) {
          result.set(String(campania.empresaId), campania);
        }
        return result;
      }, new Map());
  }, [parentCampanias, lotes]);
  const activeCampaignForNewLote = useMemo(() => (
    activeCampaignsByEmpresa.get(String(empresaDestinoNuevoLoteId)) ?? null
  ), [activeCampaignsByEmpresa, empresaDestinoNuevoLoteId]);
  const parentFilteredLotes = useMemo(() => (
    selectedParentEmpresaId
      ? lotes.filter((lote) => String(lote.empresaId) === String(selectedParentEmpresaId))
      : lotes
  ), [lotes, selectedParentEmpresaId]);

  return {
    empresasDisponibles, rolEmpresaActual, permisosRol, selectedParentEmpresa,
    campaniasDisponibles, selectedParentCampania, selectedParentCampaniaCombinaciones,
    empresaDestinoNuevoLoteId, activeCampaignsByEmpresa, activeCampaignForNewLote,
    parentFilteredLotes
  };
}
