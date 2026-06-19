import * as forge from 'node-forge';

/**
 * Firma el TRA (Ticket de Requerimiento de Acceso) en formato CMS/PKCS#7
 * requerido por WSAA LoginCms.
 */
export function signLoginTicketRequest(
  traXml: string,
  certificatePem: string,
  privateKeyPem: string,
): string {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      {
        type: forge.pki.oids.contentType,
        value: forge.pki.oids.data,
      },
      {
        type: forge.pki.oids.messageDigest,
      },
      {
        type: forge.pki.oids.signingTime,
        value: new Date().toISOString(),
      },
    ],
  });

  p7.sign({ detached: false });

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return Buffer.from(der, 'binary').toString('base64');
}
