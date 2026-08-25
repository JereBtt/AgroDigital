using System.ComponentModel.DataAnnotations;

namespace AgroDigital.Api.Dtos;

public class LoteCoordenadaDto
{
    [Required]
    [Range(1, int.MaxValue)]
    public int Orden { get; set; }

    [Required]
    [Range(-90, 90)]
    public decimal Latitud { get; set; }

    [Required]
    [Range(-180, 180)]
    public decimal Longitud { get; set; }
}
