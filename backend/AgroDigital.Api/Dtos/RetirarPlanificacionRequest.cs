namespace AgroDigital.Api.Dtos;

public sealed class RetirarPlanificacionRequest : DeshabilitarLoteRequest
{
    public bool AfectarOtroCiclo { get; set; }
}
