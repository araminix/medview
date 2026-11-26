/** The DICOM attributes MedView names and reads. Tags are written "GGGG,EEEE". */
const ENTRIES: Array<[tag: string, name: string, vr: string]> = [
  ['0002,0010', 'TransferSyntaxUID', 'UI'],
  ['0008,0005', 'SpecificCharacterSet', 'CS'], ['0008,0008', 'ImageType', 'CS'], ['0008,0016', 'SOPClassUID', 'UI'],
  ['0008,0018', 'SOPInstanceUID', 'UI'], ['0008,0020', 'StudyDate', 'DA'], ['0008,0021', 'SeriesDate', 'DA'],
  ['0008,0022', 'AcquisitionDate', 'DA'], ['0008,0023', 'ContentDate', 'DA'], ['0008,0030', 'StudyTime', 'TM'],
  ['0008,0050', 'AccessionNumber', 'SH'], ['0008,0060', 'Modality', 'CS'], ['0008,0070', 'Manufacturer', 'LO'],
  ['0008,0080', 'InstitutionName', 'LO'], ['0008,0081', 'InstitutionAddress', 'ST'], ['0008,0090', 'ReferringPhysicianName', 'PN'],
  ['0008,1010', 'StationName', 'SH'], ['0008,1030', 'StudyDescription', 'LO'], ['0008,103E', 'SeriesDescription', 'LO'],
  ['0008,1040', 'InstitutionalDepartmentName', 'LO'], ['0008,1048', 'PhysiciansOfRecord', 'PN'],
  ['0008,1050', 'PerformingPhysicianName', 'PN'], ['0008,1070', 'OperatorsName', 'PN'], ['0008,1090', 'ManufacturerModelName', 'LO'],
  ['0010,0010', 'PatientName', 'PN'], ['0010,0020', 'PatientID', 'LO'], ['0010,0030', 'PatientBirthDate', 'DA'],
  ['0010,0032', 'PatientBirthTime', 'TM'], ['0010,0040', 'PatientSex', 'CS'], ['0010,1000', 'OtherPatientIDs', 'LO'],
  ['0010,1001', 'OtherPatientNames', 'PN'], ['0010,1005', 'PatientBirthName', 'PN'], ['0010,1010', 'PatientAge', 'AS'],
  ['0010,1020', 'PatientSize', 'DS'], ['0010,1030', 'PatientWeight', 'DS'], ['0010,1040', 'PatientAddress', 'LO'],
  ['0010,1060', 'PatientMotherBirthName', 'PN'], ['0010,2154', 'PatientTelephoneNumbers', 'SH'], ['0010,4000', 'PatientComments', 'LT'],
  ['0018,0015', 'BodyPartExamined', 'CS'], ['0018,0050', 'SliceThickness', 'DS'], ['0018,0060', 'KVP', 'DS'],
  ['0018,0087', 'MagneticFieldStrength', 'DS'], ['0018,1030', 'ProtocolName', 'LO'], ['0018,5100', 'PatientPosition', 'CS'],
  ['0020,000D', 'StudyInstanceUID', 'UI'], ['0020,000E', 'SeriesInstanceUID', 'UI'], ['0020,0010', 'StudyID', 'SH'],
  ['0020,0011', 'SeriesNumber', 'IS'], ['0020,0013', 'InstanceNumber', 'IS'], ['0020,0032', 'ImagePositionPatient', 'DS'],
  ['0020,1041', 'SliceLocation', 'DS'],
  ['0028,0002', 'SamplesPerPixel', 'US'], ['0028,0004', 'PhotometricInterpretation', 'CS'], ['0028,0006', 'PlanarConfiguration', 'US'],
  ['0028,0008', 'NumberOfFrames', 'IS'], ['0028,0010', 'Rows', 'US'], ['0028,0011', 'Columns', 'US'], ['0028,0030', 'PixelSpacing', 'DS'],
  ['0028,0100', 'BitsAllocated', 'US'], ['0028,0101', 'BitsStored', 'US'], ['0028,0102', 'HighBit', 'US'],
  ['0028,0103', 'PixelRepresentation', 'US'], ['0028,0301', 'BurnedInAnnotation', 'CS'], ['0028,1050', 'WindowCenter', 'DS'],
  ['0028,1051', 'WindowWidth', 'DS'], ['0028,1052', 'RescaleIntercept', 'DS'], ['0028,1053', 'RescaleSlope', 'DS'],
  ['0032,1032', 'RequestingPhysician', 'PN'], ['0032,1060', 'RequestedProcedureDescription', 'LO'],
  ['7FE0,0010', 'PixelData', 'OW'],
];

const BY_TAG = new Map(ENTRIES.map(([tag, name, vr]) => [tag, { name, vr }]));
const BY_NAME = new Map(ENTRIES.map(([tag, name]) => [name, tag]));

export function tagInfo(tag: string): { name: string; vr: string } | undefined {
  return BY_TAG.get(tag);
}

/** The tag of a named attribute; throws on a name that is not in the dictionary, which is a programming error. */
export function tagOf(name: string): string {
  const tag = BY_NAME.get(name);
  if (!tag) throw new Error(`Unknown DICOM attribute ${name}`);
  return tag;
}

export const PIXEL_DATA = '7FE0,0010';

const TRANSFER_SYNTAXES: Record<string, string> = {
  '1.2.840.10008.1.2': 'Implicit VR Little Endian',
  '1.2.840.10008.1.2.1': 'Explicit VR Little Endian',
  '1.2.840.10008.1.2.1.99': 'Deflated Explicit VR Little Endian',
  '1.2.840.10008.1.2.2': 'Explicit VR Big Endian',
  '1.2.840.10008.1.2.5': 'RLE Lossless',
  '1.2.840.10008.1.2.4.50': 'JPEG Baseline',
  '1.2.840.10008.1.2.4.51': 'JPEG Extended (12-bit)',
  '1.2.840.10008.1.2.4.57': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.70': 'JPEG Lossless',
  '1.2.840.10008.1.2.4.80': 'JPEG-LS Lossless',
  '1.2.840.10008.1.2.4.81': 'JPEG-LS',
  '1.2.840.10008.1.2.4.90': 'JPEG 2000 Lossless',
  '1.2.840.10008.1.2.4.91': 'JPEG 2000',
};

export function transferSyntaxName(uid: string): string {
  return TRANSFER_SYNTAXES[uid] ?? uid;
}

const MODALITIES: Record<string, string> = {
  CT: 'CT scan', MR: 'MRI scan', CR: 'X-ray', DX: 'X-ray', XA: 'Angiography', US: 'Ultrasound', MG: 'Mammography',
  NM: 'Nuclear medicine scan', PT: 'PET scan', RF: 'Fluoroscopy', OT: 'Image', SC: 'Captured image', ECG: 'ECG', IO: 'Dental X-ray', PX: 'Panoramic dental X-ray',
};

export function modalityName(code: string | undefined): string {
  return (code && MODALITIES[code.toUpperCase()]) || (code ? `${code} imaging` : 'Imaging');
}
