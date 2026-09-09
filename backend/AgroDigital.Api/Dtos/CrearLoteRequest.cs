using System.ComponentModel.DataAnnotations;

namespace AgroDigital.Api.Dtos;

public class CrearLoteRequest
{
    [Required]
    [StringLength(100)]
    public string Nombre { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Pais { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Provincia { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Ciudad { get; set; } = string.Empty;

    [Required]
    [RegularExpression("^(Propio|Alquilado)$")]
    public string Condicion { get; set; } = string.Empty;

    [Required]
    [StringLength(60)]
    public string CultivoAnterior { get; set; } = string.Empty;

    [Required]
    [StringLength(20)]
    public string CultivoAnteriorCampania { get; set; } = string.Empty;

    [Range(0.0001, double.MaxValue)]
    public decimal Hectareas { get; set; }

    [Range(0.0001, double.MaxValue)]
    public decimal SuperficieTotal { get; set; }

    [MinLength(3, ErrorMessage = "Un lote debe tener al menos tres coordenadas para formar un poligono.")]
    public List<LoteCoordenadaDto> Coordenadas { get; set; } = [];
}
