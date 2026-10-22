using System.Net;
using System.Text;
using System.Text.Json;
using AgroDigital.Api.Services;
using Microsoft.Extensions.Configuration;

var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
{
    ["OpenAI:ApiKey"] = "clave-de-prueba",
    ["AgroBot:Modelo"] = "gpt-6-luna"
}).Build();
var docs = new EmptyAgroBotDocumentSource();

// Ninguna prueba abre SQL ni envía una solicitud real a OpenAI.
await Caso("dato puntual y empresa aislada", "dato", "cosechas_detalle", "Silvina", "2025-2026",
    "Gerente", (result, reader, handler) =>
    {
        Check(result.Origen == "sistema", "El dato debe identificarse como información del sistema.");
        Check(reader.Calls.Count == 1 && reader.Calls[0] == (7, "cosechas_detalle", "Silvina"),
            "La lectura debe usar exclusivamente la empresa y consulta autorizadas.");
        Check(handler.Requests.Count == 2 && handler.Requests[1].Contains("5432", StringComparison.Ordinal),
            "El modelo debe recibir solo el resultado de la consulta puntual.");
    });

await Caso("detalle sin lote", "dato", "lote_ficha", "", "",
    "EmpleadoCampo", (result, reader, handler) =>
    {
        Check(result.Origen == "no_disponible" && reader.Calls.Count == 0,
            "Un detalle sin lote no debe disparar una lectura amplia.");
        Check(handler.Requests.Count == 1, "Debe pedir el filtro faltante sin otra llamada al modelo.");
    });

await Caso("derivación de análisis para empleado", "analisis", "contexto", "", "",
    "EmpleadoCampo", (result, reader, handler) =>
    {
        Check(result.Origen == "derivacion" && result.PromptReporteria?.Length > 0,
            "El análisis debe generar un prompt para Reportería IA.");
        Check(result.Respuesta.Contains("Gerente y Encargado", StringComparison.Ordinal),
            "No se debe ofrecer acceso a Reportería IA al empleado.");
        Check(reader.Calls.Count == 0 && handler.Requests.Count == 1,
            "La derivación no debe consultar ni enviar datos operativos.");
    });

await Caso("ayuda por rol", "ayuda", "contexto", "", "",
    "EmpleadoAdministrativo", (result, reader, handler) =>
    {
        Check(result.Origen == "ayuda", "La respuesta debe indicar su origen funcional.");
        Check(handler.Requests[1].Contains("No disponible para este rol", StringComparison.Ordinal),
            "La ayuda debe ocultar funciones no autorizadas.");
        Check(reader.Calls.Count == 0, "La ayuda no debe abrir SQL.");
    });

await Caso("conocimiento general", "general", "contexto", "", "",
    "Encargado", (result, reader, handler) =>
    {
        Check(result.Origen == "general" && reader.Calls.Count == 0,
            "El conocimiento general no debe presentarse como un registro interno.");
        Check(handler.Requests[1].Contains("Sin datos del sistema", StringComparison.Ordinal),
            "La respuesta general no debe recibir datos internos.");
    });

Console.WriteLine("AgroBot: 5 pruebas de flujo correctas.");

async Task Caso(string nombre, string tipo, string consulta, string lote, string campania,
    string rol, Action<AgroBotResult, FakeReader, FakeHandler> verify)
{
    var reader = new FakeReader();
    var handler = new FakeHandler(tipo, consulta, lote, campania);
    var service = new AgroBotService(reader, docs, config, new FakeFactory(handler));
    var result = await service.ResponderAsync(7, rol, "Pregunta de prueba",
        [new AgroBotMessage("usuario", "Contexto anterior")], CancellationToken.None);
    verify(result, reader, handler);
    Console.WriteLine($"OK: {nombre}");
}

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

sealed class FakeReader : IAgroBotDataReader
{
    public List<(int, string, string?)> Calls { get; } = [];
    public Task<IReadOnlyList<object>> ConsultarAsync(int empresaId, string consulta, string? campania,
        string? lote, string? cultivo, CancellationToken ct)
    {
        Calls.Add((empresaId, consulta, lote));
        return Task.FromResult<IReadOnlyList<object>>([new { lote = "Silvina", rindeKgHa = 5432 }]);
    }
}

sealed class FakeFactory(FakeHandler handler) : IHttpClientFactory
{
    public HttpClient CreateClient(string name) => new(handler);
}

sealed class FakeHandler(string tipo, string consulta, string lote, string campania) : HttpMessageHandler
{
    public List<string> Requests { get; } = [];
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Requests.Add(await request.Content!.ReadAsStringAsync(ct));
        object body = Requests.Count == 1
            ? new { output = new object[] { new {
                type = "function_call", name = "clasificar_consulta",
                arguments = JsonSerializer.Serialize(new { tipo, consulta, lote, campania, cultivo = "",
                    promptReporteria = "Compará las campañas 2024-2025 y 2025-2026" }) } } }
            : new { output = new object[] { new { type = "message", content = new object[] {
                new { type = "output_text", text = "Respuesta de prueba" } } } } };
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json")
        };
    }
}
