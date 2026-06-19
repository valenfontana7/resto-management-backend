export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildLoginTicketRequestXml(
  uniqueId: number,
  generationTime: Date,
  expirationTime: Date,
  service: string,
): string {
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  return `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${fmt(generationTime)}</generationTime>
    <expirationTime>${fmt(expirationTime)}</expirationTime>
  </header>
  <service>${escapeXml(service)}</service>
</loginTicketRequest>`;
}

export function buildLoginCmsEnvelope(cmsBase64: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="https://wsaa.afip.gov.ar/ws/services/LoginCms">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${escapeXml(cmsBase64)}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function parseXmlTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? null;
}

export function parseSoapFault(xml: string): string | null {
  const faultString = parseXmlTag(xml, 'faultstring');
  if (faultString) return faultString;
  const message = parseXmlTag(xml, 'Msg');
  return message;
}

export interface AfipAuthCredentials {
  token: string;
  sign: string;
  expirationTime: Date;
}

export function parseLoginCmsResponse(xml: string): AfipAuthCredentials {
  const credentialsXml = parseXmlTag(xml, 'loginCmsReturn');
  if (!credentialsXml) {
    throw new Error(parseSoapFault(xml) ?? 'Respuesta WSAA inválida');
  }

  const decoded = credentialsXml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  const token = parseXmlTag(decoded, 'token');
  const sign = parseXmlTag(decoded, 'sign');
  const expirationRaw = parseXmlTag(decoded, 'expirationTime');

  if (!token || !sign || !expirationRaw) {
    throw new Error('WSAA no devolvió token/sign');
  }

  return {
    token,
    sign,
    expirationTime: new Date(expirationRaw),
  };
}

export function buildWsfeEnvelope(action: string, bodyInner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="http://ar.gov.afip.dif.FEV1/">
      ${bodyInner}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
}

export function buildWsfeAuthBlock(
  token: string,
  sign: string,
  cuit: number,
): string {
  return `<Auth>
        <Token>${escapeXml(token)}</Token>
        <Sign>${escapeXml(sign)}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>`;
}
