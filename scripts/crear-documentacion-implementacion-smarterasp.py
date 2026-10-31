from pathlib import Path
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "docs" / "Implementacion y puesta en produccion AgroDigital SmarterASP.docx"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_border(cell, color="D9D9D9"):
    tc_pr = cell._tc.get_or_add_tcPr()
    borders = tc_pr.first_child_found_in("w:tcBorders")
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = "w:" + edge
        element = borders.find(qn(tag))
        if element is None:
            element = OxmlElement(tag)
            borders.append(element)
        element.set(qn("w:val"), "single")
        element.set(qn("w:sz"), "4")
        element.set(qn("w:color"), color)


def set_cell_margins(cell, top=110, start=110, bottom=110, end=110):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn("w:" + margin))
        if node is None:
            node = OxmlElement("w:" + margin)
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_keep_with_next(paragraph):
    p_pr = paragraph._p.get_or_add_pPr()
    keep = OxmlElement("w:keepNext")
    p_pr.append(keep)


def set_run_font(run, size=None, bold=None, color=None):
    run.font.name = "Aptos"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    if size:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_paragraph(doc, text="", style=None, bold_lead=None):
    p = doc.add_paragraph(style=style)
    p.paragraph_format.space_after = Pt(7)
    p.paragraph_format.line_spacing = 1.14
    if bold_lead and text.startswith(bold_lead):
        lead = p.add_run(bold_lead)
        set_run_font(lead, bold=True)
        rest = p.add_run(text[len(bold_lead):])
        set_run_font(rest)
    else:
        run = p.add_run(text)
        set_run_font(run)
    return p


def add_heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    p.paragraph_format.space_before = Pt(15 if level == 1 else 9)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    set_run_font(run, 14 if level == 1 else 11.5, bold=True, color="000000")
    return p


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.1
        run = p.add_run(item)
        set_run_font(run)


def add_table(doc, headers, rows, widths=None):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.autofit = False
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for i, label in enumerate(headers):
        cell = hdr.cells[i]
        set_cell_shading(cell, "245B3C")
        set_cell_border(cell)
        set_cell_margins(cell)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(label)
        set_run_font(r, 9, bold=True, color="FFFFFF")
        if widths:
            cell.width = Cm(widths[i])
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for i, value in enumerate(values):
            cell = cells[i]
            if row_index % 2 == 1:
                set_cell_shading(cell, "F4F7F4")
            set_cell_border(cell)
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.05
            if i == 0 and len(headers) > 2:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(value)
            set_run_font(r, 8.8)
            if widths:
                cell.width = Cm(widths[i])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    return table


doc = Document()
section = doc.sections[0]
section.top_margin = Cm(2.1)
section.bottom_margin = Cm(1.8)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

styles = doc.styles
styles["Normal"].font.name = "Aptos"
styles["Normal"]._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
styles["Normal"]._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
styles["Normal"].font.size = Pt(10.5)
for style_name in ("Title", "Heading 1", "Heading 2"):
    styles[style_name].font.color.rgb = RGBColor(0, 0, 0)

header = section.header
hp = header.paragraphs[0]
hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
hr = hp.add_run("AgroDigital  |  Implementación")
set_run_font(hr, 8.5, color="5A6B60")

footer = section.footer
fp = footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = fp.add_run("Documento de implementación y aceptación")
set_run_font(fr, 8, color="5A6B60")

doc.core_properties.title = "Implementación y puesta en producción AgroDigital"
doc.core_properties.subject = "Despliegue de demostración en SmarterASP"
doc.core_properties.author = "AgroDigital"
doc.core_properties.comments = ""

title = doc.add_paragraph(style="Title")
title.alignment = WD_ALIGN_PARAGRAPH.LEFT
title.paragraph_format.space_after = Pt(8)
tr = title.add_run("Implementación y puesta en producción AgroDigital")
set_run_font(tr, 23, bold=True, color="000000")

subtitle = doc.add_paragraph()
subtitle.paragraph_format.space_after = Pt(18)
sr = subtitle.add_run("Despliegue de demostración en SmarterASP")
set_run_font(sr, 13, color="245B3C")

add_paragraph(doc, "Este documento describe la implementación de AgroDigital en un entorno de demostración con SmarterASP. Define la modalidad de operación seleccionada, la preparación e instalación realizadas, la capacitación mínima, las pruebas de aceptación y el procedimiento de evaluación y ajuste posterior. El objetivo es dejar evidencia de un paso a producción controlado, repetible y seguro.")

add_table(doc, ["Elemento", "Definición"], [
    ("Sistema", "AgroDigital, aplicación web para la gestión operativa y productiva agrícola."),
    ("Entorno de demostración", "Hosting Windows SmarterASP con ASP.NET Core 9, IIS y SQL Server 2019 o superior."),
    ("Arquitectura publicada", "Frontend React compilado y API ASP.NET Core bajo el mismo sitio HTTPS."),
    ("Alcance", "Módulos operativos, gestión de grano, estadísticas, adjuntos, Reportería IA y AgroBot según la configuración disponible."),
], [4.0, 12.8])

add_heading(doc, "1 Objetivo y criterio de implementación")
add_paragraph(doc, "La implementación busca entregar una versión funcional de AgroDigital en un entorno accesible por navegador, con base de datos centralizada y controles previos para reducir errores de publicación. La aceptación se considera satisfactoria cuando el sitio inicia por HTTPS, permite autenticarse con una cuenta de demostración, mantiene la separación por empresa y ejecuta los flujos principales sin fallas críticas.")
add_paragraph(doc, "La puesta en producción se realizó mediante un paquete generado desde el repositorio. El frontend usa rutas relativas para consumir la API en el mismo origen, evitando dependencias de puertos locales y problemas de CORS entre dominios.")

add_heading(doc, "2 Modalidad de operación seleccionada")
add_paragraph(doc, "Se seleccionó una implementación directa o global para el entorno de demostración. El sistema se publica como una única aplicación integrada: el frontend y la API se despliegan juntos bajo el mismo sitio HTTPS, mientras que la base de datos se prepara previamente en SQL Server del hosting.")
add_paragraph(doc, "Esta modalidad es adecuada porque el objetivo es demostrar el sistema completo sin mantener dos plataformas en paralelo. La reducción de riesgo se logra mediante validaciones previas, una cuenta de demostración separada, respaldo de datos y una prueba de aceptación por módulos inmediatamente después de la publicación.")
add_table(doc, ["Alternativa", "Decisión", "Justificación"], [
    ("Directa o global", "Seleccionada", "El sistema se presenta integrado en un único sitio y la demostración requiere disponibilidad completa."),
    ("Gradual o encadenada", "No aplicada", "No se requiere coexistencia por etapas entre sistemas anteriores y AgroDigital."),
    ("En paralelo", "No aplicada", "No se definió un sistema legado productivo para comparar operaciones durante la demostración."),
    ("Por subsistemas", "Usada solo para pruebas", "Los módulos se verifican de forma modular durante la aceptación, pero se liberan juntos."),
], [3.7, 3.0, 10.1])

add_heading(doc, "3 Capacitación para la implementación")
add_paragraph(doc, "La capacitación propuesta es breve, orientada a tareas y basada en roles. Antes de usar el sitio, los participantes deben conocer el acceso HTTPS, la selección de empresa y las restricciones de permisos. La demostración debe utilizar cuentas independientes de la cuenta interna Administrador.")
add_table(doc, ["Participante", "Contenidos mínimos", "Evidencia esperada"], [
    ("Gerente y Encargado", "Acceso, empresa activa, Lotes, Campañas, Siembras, Cosechas, Silos, movimientos de grano, Estadísticas y Reportería IA.", "Completa un circuito operativo y consulta resultados."),
    ("Empleado de campo", "Consulta operativa, registros de seguimiento, partes de cosecha, tiradas de aros y controles de silo.", "Registra una actividad permitida por su rol."),
    ("Empleado administrativo", "Consulta operativa, Almacenamiento y Distribución.", "Registra o consulta un movimiento autorizado."),
    ("Responsable técnico", "Configuración protegida, publicación, reinicio, validación, respaldo y revisión de incidencias.", "Puede repetir la publicación sin exponer secretos."),
], [3.3, 8.0, 5.5])

add_heading(doc, "4 Preparación de la instalación")
add_paragraph(doc, "Antes de publicar se prepara la base de datos, el paquete de aplicación y la configuración protegida. Las credenciales de SQL, la clave de firma de sesión, la configuración de correo y la clave de OpenAI no se incluyen en Git ni en el paquete público.")
add_table(doc, ["Paso", "Actividad", "Control"], [
    ("1", "Respaldar la base local y los documentos antes de cualquier cambio.", "Respaldo disponible y recuperable."),
    ("2", "Crear la base en SmarterASP y aplicar la instalación inicial o la secuencia aprobada de migraciones.", "No volver a ejecutar incrementales sobre una base ya actualizada."),
    ("3", "Configurar un usuario SQL de aplicación con los permisos necesarios para la demostración.", "No usar autenticación integrada ni la cuenta sa."),
    ("4", "Generar el paquete con preparar-publicacion-smarterasp.ps1.", "La salida está limitada a artifacts/smarterasp."),
    ("5", "Ejecutar la validación previa a la subida.", "API, web.config, frontend compilado y plantilla de producción presentes."),
    ("6", "Cargar valores reales mediante la configuración protegida del hosting.", "No incluir appsettings.Production.json en FTP, Web Deploy ni ZIP."),
], [1.1, 9.2, 6.5])

add_heading(doc, "5 Realización de la instalación")
add_paragraph(doc, "La instalación se ejecuta desde la raíz del repositorio. El script de preparación compila el frontend React con VITE_API_BASE_URL vacío, publica la API en modo Release y copia el resultado a wwwroot. El archivo web.config generado permite que IIS inicie la API mediante dotnet.")
add_table(doc, ["Orden", "Acción"], [
    ("1", "Ejecutar .\\scripts\\preparar-publicacion-smarterasp.ps1."),
    ("2", "Confirmar que la validación previa informa aprobación."),
    ("3", "Publicar solamente el contenido de artifacts/smarterasp mediante FTP o Web Deploy."),
    ("4", "Cargar en el hosting los valores protegidos de conexión, Auth, CORS, Storage y, si corresponde, correo u OpenAI."),
    ("5", "Reiniciar la aplicación desde el panel de SmarterASP si es necesario."),
    ("6", "Abrir la URL HTTPS asignada desde una red externa."),
], [1.4, 15.4])
add_paragraph(doc, "Control de seguridad aplicado: el empaquetador rechaza borrar una ruta distinta de artifacts/smarterasp y también rechaza enlaces o puntos de montaje. La validación falla si encuentra un archivo appsettings.Production.json en el paquete. Las configuraciones privadas se conservan fuera del artefacto publicable.", bold_lead="Control de seguridad aplicado: ")

add_heading(doc, "6 Prueba de aceptación")
add_paragraph(doc, "La prueba de aceptación debe realizarse inmediatamente luego de la publicación, con una cuenta de demostración y desde una red externa. Cada caso se marca como aprobado, observado o rechazado, registrando el resultado y una evidencia breve. Las funciones de correo y de IA se prueban únicamente cuando sus credenciales estén configuradas en el hosting.")
add_table(doc, ["Caso", "Resultado esperado", "Estado"], [
    ("Acceso HTTPS", "El sitio carga sin advertencias y muestra la pantalla de ingreso.", "Pendiente de registro"),
    ("Autenticación y empresa", "El usuario inicia sesión y visualiza la empresa autorizada.", "Pendiente de registro"),
    ("Operación agrícola", "Lotes, Campañas, Siembras y Cosechas consultan y registran según permisos.", "Pendiente de registro"),
    ("Gestión de grano", "Silos, Almacenamiento y Distribución permiten el flujo autorizado.", "Pendiente de registro"),
    ("Consulta y trazabilidad", "Estadísticas, adjuntos y trazabilidad recuperan información disponible.", "Pendiente de registro"),
    ("Funciones IA", "Reportería IA y AgroBot respetan permisos y solo responden si existe clave configurada.", "Condicional"),
    ("Persistencia", "Una carga de documento se conserva luego de reiniciar o publicar una nueva versión.", "Pendiente de registro"),
], [3.5, 9.1, 4.2])

add_heading(doc, "7 Evaluación y ajuste")
add_paragraph(doc, "Al finalizar la aceptación se consolidan los resultados, incidencias y ajustes. Los defectos críticos que impidan iniciar sesión, acceder a la base, ejecutar operaciones autorizadas o conservar documentos bloquean la aceptación hasta su corrección. Los ajustes no críticos se registran con prioridad, responsable y fecha objetivo para una publicación posterior.")
add_table(doc, ["Situación", "Acción de ajuste", "Criterio de cierre"], [
    ("La interfaz carga pero falla una llamada", "Verificar paquete compilado, configuración de conexión y valores CORS del hosting.", "La operación responde correctamente desde el sitio HTTPS."),
    ("Los documentos no persisten", "Configurar Storage DocumentsPath en una ubicación escribible y persistente; repetir carga y reinicio.", "El documento se descarga después del reinicio."),
    ("IA sin configuración", "Cargar OpenAI ApiKey solo en la configuración protegida y reiniciar.", "El módulo responde sin exponer la clave."),
    ("Enlaces de invitación incorrectos", "Corregir Email UrlAplicacion con la URL HTTPS final.", "El enlace generado apunta al dominio publicado."),
], [4.0, 8.4, 4.4])

add_heading(doc, "8 Cierre de implementación")
add_paragraph(doc, "El despliegue en SmarterASP deja un proceso de publicación controlado: el paquete contiene la aplicación compilada y validada, mientras que los secretos permanecen fuera del artefacto y se administran en el hosting. La implementación queda lista para su aceptación funcional cuando los casos de la sección 6 se registren con evidencia y no existan incidencias críticas abiertas.")

add_heading(doc, "9 Referencias técnicas utilizadas")
add_bullets(doc, [
    "Guía de despliegue de demostración en SmarterASP del repositorio AgroDigital.",
    "Scripts preparar-publicacion-smarterasp.ps1 y validar-publicacion-smarterasp.ps1.",
    "Plantilla appsettings.Production.example.json y scripts de configuración privada.",
])

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUTPUT)
print(OUTPUT)
