const defaultCenter = [-32.0025, -64.0055];

const ARGENTINA_ZONES = {
  'Buenos Aires': ['Azul', 'Bahia Blanca', 'Balcarce', 'Bragado', 'Chacabuco', 'Junin', 'Mar del Plata', 'Pergamino', 'Tandil', 'Tres Arroyos'],
  'Catamarca': ['Andalgala', 'Belen', 'Fiambala', 'San Fernando del Valle de Catamarca', 'Santa Maria', 'Tinogasta'],
  'Chaco': ['Charata', 'General Pinedo', 'Juan Jose Castelli', 'Las Brenas', 'Presidencia Roque Saenz Pena', 'Resistencia'],
  'Chubut': ['Comodoro Rivadavia', 'Esquel', 'Gaiman', 'Puerto Madryn', 'Rawson', 'Trelew'],
  'Ciudad Autonoma de Buenos Aires': ['Ciudad Autonoma de Buenos Aires'],
  'Cordoba': ['Alta Gracia', 'Bell Ville', 'Cordoba', 'Jesus Maria', 'La Falda', 'Los Condores', 'Marcos Juarez', 'Panaholma', 'Rio Cuarto', 'Rio Tercero', 'Villa Maria'],
  'Corrientes': ['Bella Vista', 'Corrientes', 'Curuzu Cuatia', 'Goya', 'Mercedes', 'Paso de los Libres'],
  'Entre Rios': ['Chajari', 'Concordia', 'Gualeguaychu', 'Parana', 'Victoria', 'Villaguay'],
  'Formosa': ['Clorinda', 'El Colorado', 'Formosa', 'Ingeniero Juarez', 'Las Lomitas', 'Pirane'],
  'Jujuy': ['Humahuaca', 'La Quiaca', 'Libertador General San Martin', 'Palpala', 'San Salvador de Jujuy', 'Tilcara'],
  'La Pampa': ['General Acha', 'General Pico', 'Realico', 'Santa Rosa', 'Toay', 'Victorica'],
  'La Rioja': ['Aimogasta', 'Chamical', 'Chilecito', 'La Rioja', 'Villa Union'],
  'Mendoza': ['General Alvear', 'Godoy Cruz', 'Malargue', 'Mendoza', 'San Rafael', 'Tunuyan'],
  'Misiones': ['Eldorado', 'Leandro N. Alem', 'Obera', 'Posadas', 'Puerto Iguazu', 'San Vicente'],
  'Neuquen': ['Centenario', 'Chos Malal', 'Cutral Co', 'Neuquen', 'San Martin de los Andes', 'Zapala'],
  'Rio Negro': ['Bariloche', 'Cipolletti', 'General Roca', 'Rio Colorado', 'Viedma', 'Villa Regina'],
  'Salta': ['Cafayate', 'Metan', 'Oran', 'Rosario de la Frontera', 'Salta', 'Tartagal'],
  'San Juan': ['Caucete', 'Jachal', 'Rawson', 'San Juan', 'San Martin', 'Valle Fertil'],
  'San Luis': ['La Punta', 'La Toma', 'Merlo', 'San Luis', 'Villa Mercedes'],
  'Santa Cruz': ['Caleta Olivia', 'El Calafate', 'Gobernador Gregores', 'Pico Truncado', 'Rio Gallegos'],
  'Santa Fe': ['Arroyo Seco', 'Casilda', 'Rafaela', 'Reconquista', 'Rosario', 'Santa Fe', 'Venado Tuerto'],
  'Santiago del Estero': ['Anatuya', 'Bandera', 'Frias', 'La Banda', 'Quimili', 'Santiago del Estero'],
  'Tierra del Fuego': ['Rio Grande', 'Tolhuin', 'Ushuaia'],
  'Tucuman': ['Aguilares', 'Concepcion', 'Famailla', 'San Miguel de Tucuman', 'Tafi Viejo', 'Yerba Buena']
};

const provinces = Object.keys(ARGENTINA_ZONES);
const commonGrains = ['Soja', 'Maiz', 'Sorgo', 'Trigo', 'Girasol', 'Otro'];

export { ARGENTINA_ZONES, provinces, commonGrains, defaultCenter };
