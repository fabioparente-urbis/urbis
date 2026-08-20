/**
 * Conversão UTM Zona 22S (SIRGAS 2000, EPSG:31982) → lat/lng.
 *
 * Extraído de `app/processo/ProcessoClient.tsx`, onde vivia só para converter
 * coordenada colada à mão no campo. Virou módulo porque o servidor passou a
 * precisar da mesma conta: o Mapa Fácil de Goiânia devolve `x_coord`/`y_coord`
 * em UTM, e o campo `coordenadas` do LIP guarda lat/lng (é o que Google Maps e
 * Google Earth entendem nos botões da tela).
 *
 * A fórmula é a inversa padrão da projeção transversa de Mercator; os
 * coeficientes vêm do elipsoide GRS80/SIRGAS 2000 — o mesmo do datum oficial
 * da Prefeitura. Zona 22 fixa: Goiânia inteira cai nela.
 */

/** Meridiano central da zona 22 (−51°) em graus. */
const LON0_ZONA22 = (22 - 1) * 6 - 180 + 3;

export function utmToLatLng(easting: number, northing: number): { lat: number; lng: number } {
  const k0 = 0.9996, a = 6378137.0, e = 0.0818191908426;
  const e1sq = 0.006739496742;
  const x = easting - 500000;
  // Hemisfério sul: o falso norte de 10.000.000 m sai aqui.
  const y = northing - 10000000;
  const M = y / k0;
  const mu = M / (a * (1 - Math.pow(e, 2) / 4 - 3 * Math.pow(e, 4) / 64 - 5 * Math.pow(e, 6) / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const fp = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
           + (21 * Math.pow(e1, 2) / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
           + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
           + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
  const C1 = e1sq * Math.pow(Math.cos(fp), 2);
  const T1 = Math.pow(Math.tan(fp), 2);
  const R1 = a * (1 - e * e) / Math.pow(1 - Math.pow(e * Math.sin(fp), 2), 1.5);
  const N1 = a / Math.sqrt(1 - Math.pow(e * Math.sin(fp), 2));
  const D = x / (N1 * k0);
  const lat = fp - (N1 * Math.tan(fp) / R1) * (Math.pow(D, 2) / 2 - (5 + 3 * T1 + 10 * C1 - 4 * Math.pow(C1, 2) - 9 * e1sq) * Math.pow(D, 4) / 24 + (61 + 90 * T1 + 298 * C1 + 45 * Math.pow(T1, 2) - 252 * e1sq - 3 * Math.pow(C1, 2)) * Math.pow(D, 6) / 720);
  const lng = LON0_ZONA22 * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6 + (5 - 2 * C1 + 28 * T1 - 3 * Math.pow(C1, 2) + 8 * e1sq + 24 * Math.pow(T1, 2)) * Math.pow(D, 5) / 120) / Math.cos(fp);
  return { lat: lat * 180 / Math.PI, lng: lng * 180 / Math.PI };
}

/**
 * Faixa de valores que caracteriza UTM 22S. Serve para distinguir um par UTM
 * de um par lat/lng já convertido — em lat/lng os números são pequenos
 * (|lat| < 90), em UTM o northing passa de 7 milhões.
 */
export function pareceUTM(a: number, b: number): boolean {
  return a > 10000 && b > 1000000;
}

/** Formata lat/lng no padrão que o campo `coordenadas` do LIP guarda. */
export function formatarLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(8)},${lng.toFixed(8)}`;
}
