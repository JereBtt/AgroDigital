using System.ComponentModel.DataAnnotations;

namespace AgroDigital.Api.Dtos;

public class ActualizarLoteRequest : CrearLoteRequest
{
    [Required]
    public bool Activo { get; set; } = true;
}
