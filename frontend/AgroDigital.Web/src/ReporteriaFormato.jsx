import React from 'react';

// Formato acotado para respuestas del modelo. React escapa el texto; no se interpreta HTML.
function enLinea(texto) {
  return texto.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|`[^`\n]+`)/g).map((parte, indice) => {
    if (parte.startsWith('**') && parte.endsWith('**')) return <strong key={indice}>{parte.slice(2, -2)}</strong>;
    if (parte.startsWith('__') && parte.endsWith('__')) return <strong key={indice}>{parte.slice(2, -2)}</strong>;
    if (parte.startsWith('*') && parte.endsWith('*')) return <em key={indice}>{parte.slice(1, -1)}</em>;
    if (parte.startsWith('`') && parte.endsWith('`')) return <code key={indice}>{parte.slice(1, -1)}</code>;
    return parte;
  });
}

function celdas(linea) {
  return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(celda => celda.trim());
}

export default function ReporteriaFormato({ contenido = '' }) {
  const lineas = contenido.replace(/\r\n?/g, '\n').split('\n');
  const bloques = [];
  let parrafo = [];
  let lista = [];
  let tipoLista = '';
  let tabla = [];
  let codigo = [];
  let enCodigo = false;

  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push(<p key={bloques.length}>{enLinea(parrafo.join(' '))}</p>);
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista.length) {
      const items = lista.map((item, indice) => <li key={indice}>{enLinea(item)}</li>);
      bloques.push(tipoLista === 'ol' ? <ol key={bloques.length}>{items}</ol> : <ul key={bloques.length}>{items}</ul>);
    }
    lista = [];
    tipoLista = '';
  };
  const cerrarTabla = () => {
    if (tabla.length) {
      const filas = tabla.filter((fila, indice) => indice !== 1 || !fila.every(celda => /^:?-{3,}:?$/.test(celda)));
      const [encabezado, ...datos] = filas;
      bloques.push(<div className="ria-table-wrap" key={bloques.length}><table>
        <thead><tr>{encabezado.map((celda, indice) => <th key={indice}>{enLinea(celda)}</th>)}</tr></thead>
        <tbody>{datos.map((fila, indice) => <tr key={indice}>{fila.map((celda, col) => <td key={col}>{enLinea(celda)}</td>)}</tr>)}</tbody>
      </table></div>);
    }
    tabla = [];
  };

  for (const linea of lineas) {
    const limpia = linea.trim();
    if (limpia.startsWith('```')) {
      cerrarParrafo(); cerrarLista(); cerrarTabla();
      if (enCodigo) {
        bloques.push(<pre key={bloques.length}><code>{codigo.join('\n')}</code></pre>);
        codigo = [];
      }
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) { codigo.push(linea); continue; }
    if (limpia.startsWith('|') && limpia.endsWith('|')) {
      cerrarParrafo(); cerrarLista();
      tabla.push(celdas(limpia));
      continue;
    }
    cerrarTabla();
    if (!limpia) { cerrarParrafo(); cerrarLista(); continue; }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(limpia)) {
      cerrarParrafo(); cerrarLista();
      bloques.push(<hr key={bloques.length} />);
      continue;
    }
    const titulo = limpia.match(/^(#{1,3})\s+(.+)$/);
    const tituloNegrita = limpia.match(/^\*\*(.+)\*\*:?$/);
    if (titulo || tituloNegrita) {
      cerrarParrafo(); cerrarLista();
      const texto = titulo ? titulo[2] : tituloNegrita[1];
      const clase = titulo?.[1]?.length === 1 ? 'ria-title-xl' : 'ria-title';
      bloques.push(<h3 className={clase} key={bloques.length}>{enLinea(texto)}</h3>);
      continue;
    }
    const viñeta = limpia.match(/^[-*+]\s+(.+)$/);
    const numero = limpia.match(/^\d+[.)]\s+(.+)$/);
    if (viñeta || numero) {
      cerrarParrafo();
      const nuevoTipo = numero ? 'ol' : 'ul';
      if (tipoLista && tipoLista !== nuevoTipo) cerrarLista();
      tipoLista = nuevoTipo;
      lista.push((viñeta || numero)[1]);
      continue;
    }
    cerrarLista();
    parrafo.push(limpia);
  }
  cerrarParrafo(); cerrarLista(); cerrarTabla();
  if (codigo.length) bloques.push(<pre key={bloques.length}><code>{codigo.join('\n')}</code></pre>);
  return <div className="ria-answer">{bloques}</div>;
}
