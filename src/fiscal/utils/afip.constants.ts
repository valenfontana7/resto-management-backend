export type AfipEnvironment = 'homologacion' | 'produccion';

export type IssuerIvaCondition =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTO'
  | 'EXENTO';

export const AFIP_WSAA_URL: Record<AfipEnvironment, string> = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
};

export const AFIP_WSFE_URL: Record<AfipEnvironment, string> = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
};

export const AFIP_PADRON_URL: Record<AfipEnvironment, string> = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/v2/persona',
  produccion: 'https://aws.afip.gov.ar/sr-padron/v2/persona',
};

/** AFIP WSFEv1 — tipos de comprobante */
export const AFIP_CBTE_TYPE = {
  FACTURA_A: 1,
  NOTA_CREDITO_A: 3,
  FACTURA_B: 6,
  NOTA_CREDITO_B: 8,
  FACTURA_C: 11,
  NOTA_CREDITO_C: 13,
} as const;

/** AFIP WSFEv1 — tipos de documento del receptor */
export const AFIP_DOC_TYPE = {
  CUIT: 80,
  DNI: 96,
  CONSUMIDOR_FINAL: 99,
} as const;

/** Condición IVA del receptor (RG5616 / FEParamGetCondicionIvaReceptor) */
export const AFIP_IVA_CONDITION = {
  RESPONSABLE_INSCRIPTO: 1,
  EXENTO: 4,
  CONSUMIDOR_FINAL: 5,
  MONOTRIBUTO: 6,
} as const;

/** AFIP WSFEv1 — alícuota IVA 21% */
export const AFIP_IVA_ID_21 = 5;

export const AFIP_WSFE_SERVICE = 'wsfe';
export const AFIP_PADRON_SERVICE = 'ws_sr_constancia_inscripcion';

export const ISSUER_IVA_TO_AFIP: Record<IssuerIvaCondition, number> = {
  RESPONSABLE_INSCRIPTO: AFIP_IVA_CONDITION.RESPONSABLE_INSCRIPTO,
  MONOTRIBUTO: AFIP_IVA_CONDITION.MONOTRIBUTO,
  EXENTO: AFIP_IVA_CONDITION.EXENTO,
};
