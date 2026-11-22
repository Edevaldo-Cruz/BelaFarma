const crypto = require('crypto');
const defaultDb = require('../database.js');

function getDb(db) {
  return (db && typeof db.prepare === 'function') ? db : defaultDb;
}

const CATEGORIAS_DIGIFARMA = {
  REFERENCIA: 1,
  SIMILAR: 2,
  PERFUMARIA: 5,
  OUTROS: 6,
  GENERICO: 7
};

const LABS_RECONHECIDOS = [
  'PRATI DONADUZZI', 'NOVA QUIMICA', 'NEO QUIMICA', 'UNIAO QUIMICA', 'HALEX ISTAR', 'KLEY HERTZ', 'ARTE NATIVA',
  'MEDQUIMICA', 'MEDQUIMIC', 'MEDQ', 'MDQ', 'LEGRAND', 'LEG', 'EMS', 'CIMED', 'NEOQUIMICA', 'NEO QUI', 'NEO QUIMIC',
  'NEO G', 'N.Q', 'MEDLEY', 'MDL', 'EUROFARMA', 'EUROF', 'EGF', 'TEUTO', 'TEU', 'TUG', 'TUS',
  'GERMED', 'GERM', 'PRATI', 'PRT', 'ACHE', 'ACH', 'SANDOZ', 'BIOLAB', 'NOVAQUIMICA', 'NOVAQUI', 'NVQ', 'NOVQ',
  'GEOLAB', 'GEO', 'SANVAL', 'BELFAR', 'BLF', 'PHARLAB', 'LISMED', 'BIOSINTETICA', 'BIOSINT', 'BIO',
  'HYPERA', 'GLAXO', 'GSK', 'ASTRAZENECA', 'SANOFI', 'NOVARTIS', 'BAYER', 'TAKEDA', 'ABBOTT', 'APSEN',
  'CRISTALIA', 'MANTECORP', 'VITAMEDIC', 'VITAPAN', 'VTS', 'GLOBO', 'GLG', 'NATULAB', 'NAL', 'CIFARMA',
  'MULTILAB', 'BRAINFARMA', 'BRAINFAR', 'AUROBINDO', 'RANBAXY', 'RBX', 'ZYDUS', 'TORRENT', 'ZODIAC',
  'MOMENTA', 'SUPERA', 'AIRELA', 'MARIOL', 'HERTZ', 'FARMAX', 'FAX', 'CATARINENSE', 'MERCK', 'MERK',
  'PFIZER', 'BOEHRINGER', 'ALTHAIA', 'ASPEN', 'GLENMARK', 'ACCORD', 'BLAU', 'VIATRIS', 'TEVA', 'CELLERA',
  'FARMACE', 'FARMASA', 'HIPOLABOR', 'EQUIPLEX', 'SAMTEC', 'BRASTERAPICA', 'NATURELIFE', 'KATIGUA',
  'RATIO', 'ALCON', 'QUALYNUTRI', 'MAXINUTRI', 'GOLD LAB'
];

// Ordena labs do maior nome para o menor para evitar match parcial (ex: 'NEO QUIMICA' antes de 'QUIMICA')
const LABS_ORDENADOS = [...new Set(LABS_RECONHECIDOS.map(l => l.toUpperCase()))].sort((a, b) => b.length - a.length);

const EAN_PREFIX_LABS = {
  '78968629': 'MEDQUIMICA',
  '78965232': 'CIMED',
  '78967142': 'NEO QUIMICA',
  '7891317': 'EUROFARMA',
  '7896112': 'TEUTO',
  '78981483': 'PRATI',
  '7898495': 'GERMED',
  '78990952': 'GEOLAB',
  '78980497': 'VITAMEDIC',
  '78996209': 'GLOBO',
  '78966580': 'ACHE',
  '78961819': 'BIOLAB',
  '78975956': 'SANDOZ',
  '78960047': 'EMS',
  '78964225': 'MEDLEY',
  '78970769': 'RANBAXY',
  '78989275': 'ZYDUS',
  '78960062': 'EMS'
};

const SUFIXOS_LAB_MAP = {
  'MQG': 'NEO QUIMICA',
  'NVG': 'NOVA QUIMICA',
  'NVQ': 'NOVA QUIMICA',
  'TUS': 'TEUTO',
  'TUG': 'TEUTO',
  'TEU': 'TEUTO',
  'EMS': 'EMS',
  'EGF': 'EUROFARMA',
  'MDL': 'MEDLEY',
  'PRT': 'PRATI',
  'CMD': 'CIMED',
  'GLG': 'GLOBO',
  'GL': 'GLOBO',
  'GEO': 'GEOLAB',
  'ACH': 'ACHE',
  'LEG': 'LEGRAND',
  'RBX': 'RANBAXY',
  'BLF': 'BELFAR',
  'MDQ': 'MEDQUIMICA',
  'BIO': 'BIOSINTETICA',
  'VTS': 'VITAMEDIC',
  'NAL': 'NATULAB',
  'FAX': 'FARMAX'
};

// Dicionário consolidado de Marcas/Referência -> DCB canônica (sem sais neutros)
const MAPA_MARCAS_REFERENCIA = {
  'FORXIGA': 'DAPAGLIFLOZINA',
  'JARDIANCE': 'EMPAGLIFLOZINA',
  'GLIFAGE': 'METFORMINA',
  'CRESTOR': 'ROSUVASTATINA',
  'LIPITOR': 'ATORVASTATINA',
  'SELOZOK': 'METOPROLOL SUCCINATO',
  'SELOPRESS': 'METOPROLOL TARTARATO',
  'ARADOIS': 'LOSARTANA POTASSICA',
  'COZAAR': 'LOSARTANA POTASSICA',
  'DIOVAN': 'VALSARTANA',
  'DAFLON': 'DIOSMINA + HESPERIDINA',
  'PLAVIX': 'CLOPIDOGREL',
  'ELIQUIS': 'APIXABANA',
  'XARELTO': 'RIVAROXABANA',
  'PANTOCAL': 'PANTOPRAZOL',
  'NEXIUM': 'ESOMEPRAZOL',
  'LOSEC': 'OMEPRAZOL',
  'TYLENOL': 'PARACETAMOL',
  'NOVALGINA': 'DIPIRONA',
  'ANADOR': 'DIPIRONA',
  'DORFLEX': 'CAFEINA + DIPIRONA + ORFENADRINA',
  'NEOSALGINA': 'CAFEINA + DIPIRONA + ISOMETEPTENO',
  'TORSILAX': 'CAFEINA + CARISOPRODOL + DICLOFENACO SODICO + PARACETAMOL',
  'TANDRILAX': 'CAFEINA + CARISOPRODOL + DICLOFENACO SODICO + PARACETAMOL',
  'RIVOTRIL': 'CLONAZEPAM',
  'FRONTAL': 'ALPRAZOLAM',
  'LEXOTAN': 'BROMAZEPAM',
  'VALIUM': 'DIAZEPAM',
  'STILNOX': 'ZOLPIDEM',
  'PROZAC': 'FLUOXETINA',
  'ZOLOFT': 'SERTRALINA',
  'LEXAPRO': 'ESCITALOPRAM',
  'EFEXOR': 'VENLAFAXINA',
  'PRISTIQ': 'DESVENLAFAXINA',
  'CYMBALTA': 'DULOXETINA',
  'LYRICA': 'PREGABALINA',
  'NEURONTIN': 'GABAPENTINA',
  'TOPAMAX': 'TOPIRAMATO',
  'TEGRETOL': 'CARBAMAZEPINA',
  'DEPAKOTE': 'DIVALPROATO',
  'DEPAKENE': 'ACIDO VALPROICO',
  'LAMICTAL': 'LAMOTRIGINA',
  'KEPPRA': 'LEVETIRACETAM',
  'TRILEPTAL': 'OXCARBAZEPINA',
  'AEROLIN': 'SALBUTAMOL',
  'BUSCOPAN': 'ESCOPOLAMINA',
  'LUFTAL': 'SIMETICONA',
  'FLORATIL': 'SACCHAROMYCES BOULARDII',
  'DRAMIN': 'DIMENIDRINATO',
  'VONAU': 'ONDANSETRONA',
  'PLASIL': 'METOCLOPRAMIDA',
  'MOTILIUM': 'DOMPERIDONA',
  'ALLEGRA': 'FEXOFENADINA',
  'CLARITIN': 'LORATADINA',
  'LORITIL': 'LORATADINA',
  'DESALEX': 'DESLORATADINA',
  'ZITROMAX': 'AZITROMICINA',
  'AZITRONAX': 'AZITROMICINA',
  'AMOXIL': 'AMOXICILINA',
  'CLAVULIN': 'AMOXICILINA + CLAVULANATO',
  'CIPRO': 'CIPROFLOXACINO',
  'LEVAQUIN': 'LEVOFLOXACINO',
  'KEFLEX': 'CEFALEXINA',
  'BACTRIM': 'SULFAMETOXAZOL + TRIMETOPRIMA',
  'NISULID': 'NIMESULIDA',
  'CATAFLAM': 'DICLOFENACO POTASSICO',
  'VOLTAREN': 'DICLOFENACO SODICO',
  'ALIVIUM': 'IBUPROFENO',
  'ADVIL': 'IBUPROFENO',
  'FLANAX': 'NAPROXENO',
  'CELEBRA': 'CELECOXIBE',
  'ARCOXIA': 'ETORICOXIBE',
  'VIAGRA': 'SILDENAFILA',
  'CIALIS': 'TADALAFILA',
  'BETASERC': 'BETAISTINA',
  'LABIRIN': 'BETAISTINA',
  'NEBACIMED': 'BACITRACINA + NEOMICINA',
  'NEBACETIN': 'BACITRACINA + NEOMICINA',
  'PROFERGAN': 'PROMETAZINA',
  'FENERGAN': 'PROMETAZINA',
  'ADALAT': 'NIFEDIPINO',
  'ASPIRINA': 'ACIDO ACETILSALICILICO',
  'SALICETIL': 'ACIDO ACETILSALICILICO',
  'DORMEC': 'ACIDO ACETILSALICILICO',
  'ALBEL': 'ALBENDAZOL',
  'ZENTEL': 'ALBENDAZOL',
  'COXYM': 'COLCHICINA',
  'AMBROL': 'AMBROXOL',
  'FLUCOVIL': 'FLUCONAZOL',
  'LISADOR': 'ADIFENINA + DIPIRONA + PROMETAZINA',
  'DORILEN': 'ADIFENINA + DIPIRONA + PROMETAZINA',
  'PRESSAT': 'ANLODIPINO',
  'NORVASC': 'ANLODIPINO',
  'PONSTAN': 'ACIDO MEFENAMICO',
  'TRANSAMIN': 'ACIDO TRANEXAMICO',
  'PLESONAX': 'BISACODIL',
  'ACEVITON': 'ACIDO ASCORBICO',
  'CENEVIT': 'ACIDO ASCORBICO'
};

// Abreviações reais do Digifarma e distribuidoras -> DCB canônica
const ABREVIACOES_PRINCIPIOS = {
  'AMOX': 'AMOXICILINA',
  'AMOXIC': 'AMOXICILINA',
  'CLAV': 'CLAVULANATO',
  'CLAVPOT': 'CLAVULANATO',
  'CLAVUL': 'CLAVULANATO',
  'DICL': 'DICLOFENACO',
  'DICLOF': 'DICLOFENACO',
  'DEXCLORF': 'DEXCLORFENIRAMINA',
  'DEXCLORFENIRAINA': 'DEXCLORFENIRAMINA',
  'BETAMETA': 'BETAMETASONA',
  'BETAMET': 'BETAMETASONA',
  'HIDROCLOR': 'HIDROCLOROTIAZIDA',
  'HIDROCL': 'HIDROCLOROTIAZIDA',
  'HCTZ': 'HIDROCLOROTIAZIDA',
  'PARACET': 'PARACETAMOL',
  'IBUPROF': 'IBUPROFENO',
  'ACETILCIST': 'ACETILCISTEINA',
  'ALGEST': 'ALGESTONA',
  'ESTRAD': 'ESTRADIOL',
  'METFORM': 'METFORMINA',
  'LOSART': 'LOSARTANA',
  'ROSUVAST': 'ROSUVASTATINA',
  'ATORVAST': 'ATORVASTATINA',
  'SINVAST': 'SINVASTATINA',
  'OMEPRAZ': 'OMEPRAZOL',
  'PANTOPRAZ': 'PANTOPRAZOL',
  'ESOMEPRAZ': 'ESOMEPRAZOL',
  'ESCITALOP': 'ESCITALOPRAM',
  'SERTRAL': 'SERTRALINA',
  'AMITRIPT': 'AMITRIPTILINA',
  'CLONAZEP': 'CLONAZEPAM',
  'ALPRAZOL': 'ALPRAZOLAM',
  'ZOLPID': 'ZOLPIDEM',
  'DIPIR': 'DIPIRONA',
  'PROMETAZ': 'PROMETAZINA',
  'PREDNISOL': 'PREDNISOLONA',
  'PREDNIS': 'PREDNISONA',
  'AZITROM': 'AZITROMICINA',
  'CIPROFLOX': 'CIPROFLOXACINO',
  'LEVOFLOX': 'LEVOFLOXACINO',
  'NIMESUL': 'NIMESULIDA',
  'CETOPROF': 'CETOPROFENO',
  'BROMOPR': 'BROMOPRIDA',
  'DOMPERID': 'DOMPERIDONA',
  'ONDANSETR': 'ONDANSETRONA',
  'SIMETIC': 'SIMETICONA',
  'DIMETIC': 'DIMETICONA',
  'TADALAF': 'TADALAFILA',
  'SILDENAF': 'SILDENAFILA',
  'PREGAB': 'PREGABALINA',
  'QUETIAP': 'QUETIAPINA',
  'RISPERID': 'RISPERIDONA',
  'VENLAFAX': 'VENLAFAXINA',
  'FLUOXET': 'FLUOXETINA',
  'CLOPIDOGR': 'CLOPIDOGREL',
  'ANLODIP': 'ANLODIPINO',
  'ENALAP': 'ENALAPRIL',
  'CAPTOP': 'CAPTOPRIL',
  'ATENOL': 'ATENOLOL',
  'PROPRAN': 'PROPRANOLOL',
  'CARVEDIL': 'CARVEDILOL',
  'ESPIRONOL': 'ESPIRONOLACTONA',
  'FUROSEM': 'FUROSEMIDA',
  'DAPAGLIF': 'DAPAGLIFLOZINA',
  'EMPAGLIF': 'EMPAGLIFLOZINA',
  'RIVAROX': 'RIVAROXABANA',
  'APIXAB': 'APIXABANA',
  'BETAIST': 'BETAISTINA',
  'FEXOFEN': 'FEXOFENADINA',
  'LORATAD': 'LORATADINA',
  'DESLORAT': 'DESLORATADINA',
  'BECLOMET': 'BECLOMETASONA',
  'BUDESON': 'BUDESONIDA',
  'NEOMIC': 'NEOMICINA',
  'BACITR': 'BACITRACINA',
  'BACIT': 'BACITRACINA',
  'CETOCON': 'CETOCONAZOL',
  'MICONAZ': 'MICONAZOL',
  'NISTAT': 'NISTATINA',
  'FLUCON': 'FLUCONAZOL',
  'ALBENDAZ': 'ALBENDAZOL',
  'IVERMECT': 'IVERMECTINA',
  'METRONID': 'METRONIDAZOL',
  'AMBROX': 'AMBROXOL',
  'BROMEX': 'BROMEXINA',
  'CARBAMAZ': 'CARBAMAZEPINA',
  'OXCARBAZ': 'OXCARBAZEPINA',
  'DIVALPR': 'DIVALPROATO',
  'TOPIRAM': 'TOPIRAMATO',
  'GABAPENT': 'GABAPENTINA',
  'LAMOTRIG': 'LAMOTRIGINA',
  'TRAZOD': 'TRAZODONA',
  'DOXAZOS': 'DOXAZOSINA',
  'TANSULOS': 'TANSULOSINA',
  'FINASTER': 'FINASTERIDA',
  'CICLOBENZ': 'CICLOBENZAPRINA',
  'MELOXIC': 'MELOXICAM',
  'PIROXIC': 'PIROXICAM',
  'NAPROX': 'NAPROXENO',
  'CELECOX': 'CELECOXIBE',
  'ETORICOX': 'ETORICOXIBE',
  'ESCOPOL': 'ESCOPOLAMINA',
  'LOPERAM': 'LOPERAMIDA',
  'METOCLOP': 'METOCLOPRAMIDA',
  'HIDROXIZ': 'HIDROXIZINA',
  'FLUNARIZ': 'FLUNARIZINA',
  'CINARIZ': 'CINARIZINA',
  'ALOPURIN': 'ALOPURINOL',
  'COLCHIC': 'COLCHICINA',
  'LEVOTIR': 'LEVOTIROXINA',
  'DESOGEST': 'DESOGESTREL',
  'LEVONORG': 'LEVONORGESTREL',
  'ETINILESTRAD': 'ETINILESTRADIOL',
  'NORETIST': 'NORETISTERONA',
  'VALSART': 'VALSARTANA',
  'TELMISART': 'TELMISARTANA',
  'OLMESART': 'OLMESARTANA',
  'CANDESART': 'CANDESARTANA',
  'GLIMEPIR': 'GLIMEPIRIDA',
  'GLIBENCL': 'GLIBENCLAMIDA',
  'CEFALEX': 'CEFALEXINA',
  'SULFAMETOX': 'SULFAMETOXAZOL',
  'TRIMETOP': 'TRIMETOPRIMA',
  'DEXAMET': 'DEXAMETASONA',
  'HIDROCORT': 'HIDROCORTISONA',
  'NEOM': 'NEOMICINA',
  'ACETIL': 'ACETILSALICILICO'
};

// Sais neutros farmacêuticos que normalmente não alteram a intercambialidade genérico/similar
const SAIS_NEUTROS = new Set([
  'CLORIDRATO', 'CLORIDR', 'CLORID', 'CLOR', 'DICLORIDRATO', 'DICLORID', 'DICLOR', 'HCL',
  'CALCICA', 'CALCICO', 'CAL', 'POTASSICA', 'POTASSICO', 'POT', 'SODICA', 'SODICO', 'SOD',
  'MONOIDRATADA', 'MONOIDRATADO', 'MONOIDARATADA', 'DIIDRATADA', 'DIIDRATADO',
  'TRIIDRATADA', 'TRIIDRATADO', 'HEMIDRATADO', 'HEMIIDRATADO',
  'BESILATO', 'MESILATO', 'MESIL', 'MALEATO', 'OXALATO', 'BISSULFATO', 'BISSULF',
  'SULFATO', 'BROMIDRATO', 'FUROATO', 'FUMARATO', 'FOSFATO', 'FOSF', 'HEMITARTARATO', 'HEMIT',
  'TROMETAMOL', 'DIPROPIONATO', 'PROPIONATO', 'VALERATO', 'ACETONIDO', 'ACETATO', 'ACET',
  'ENANTATO', 'CITRATO', 'CARBONATO', 'NITRATO', 'BENZOATO', 'PANTOTENATO', 'TOCOFEROL',
  'SUCCINATO', 'TARTARATO', 'TARTRATO'
]);

const STOPWORDS_DESCRICAO = new Set([
  'DE', 'DA', 'DO', 'DOS', 'DAS', 'COM', 'PARA', 'POR', 'EM', 'NO', 'NA', 'C', 'X', 'CX', 'BL',
  'FR', 'TB', 'BG', 'AMP', 'FLAC', 'ENV', 'SACH', 'SACHE', 'UN', 'UND', 'UNID', 'UNIDADE', 'UNIDADES',
  'MG', 'G', 'GR', 'ML', 'L', 'MCG', 'UI', 'CPR', 'COMPR', 'COMP', 'CP', 'CAPS', 'CPS', 'CAP', 'CAPSULA', 'CAPSULAS',
  'COMPRIMIDO', 'COMPRIMIDOS', 'DRG', 'DRAGEA', 'DRAGEAS', 'PAST', 'PASTILHA', 'SUP', 'SUPOSITORIO',
  'GEN', 'GENE', 'GENERI', 'GENERICO', 'SIM', 'SIMIL', 'SIMILAR', 'REF', 'REFERENCIA',
  'REV', 'REVESTIDO', 'REVESTIDOS', 'SOL', 'SOLUCAO', 'ORAL', 'USO', 'ADULTO', 'AD', 'PEDIATRICO', 'PEDIAT', 'PED',
  'INFANTIL', 'INF', 'GOTAS', 'GTS', 'XPE', 'XAROPE', 'POM', 'PDA', 'POMADA', 'CRM', 'CR', 'CREME', 'SUSP', 'SUS',
  'SUSPENSAO', 'INJ', 'INJETAVEL', 'DERM', 'TOP', 'OFT', 'COLIRIO', 'NASAL', 'OTOL', 'VAG', 'VAGINAL',
  'SPRAY', 'SPR', 'GEL', 'APLIC', 'SABOR', 'LARANJA', 'LIMAO', 'ABACAXI', 'MENTA', 'MORANGO', 'TANGERINA',
  'ZERO', 'ACUCAR', 'DIET', 'MAST', 'MASTIG', 'MASTIGAVEL', 'EFERV', 'EFERVESCENTE', 'SUBL', 'SUBLINGUAL',
  'DURA', 'MOLE', 'PLAS', 'AMB', 'TRANS', 'OPC', 'CT', 'EST', 'ESTOJO', 'BLISTER', 'BLIST', 'DISPLAY',
  'EMB', 'LOTE', 'LOTES', 'GTIN', 'CM', 'VD', 'AL', 'FAM', 'BOT', 'PO', 'P', 'POS',
  ...LABS_ORDENADOS.flatMap(l => l.split(/\s+/))
]);

// Perfumaria, cosméticos, higiene, correlatos e multivitamínicos comerciais — nunca auto-agrupar como medicamento equivalente
const BLACKLIST_NAO_MEDICAMENTO_REGEX = /\b(ESMALTE|ESMAL|TINTURA|TINT|COLORACAO|DESCOLOR|SHAMPOO|CONDICIONADOR|SABONETE|DESODORANTE|DESOD|FRALDA|CHUPETA|CHUP|MAMADEIRA|ESCOVA|BATOM|GLOSS|RIMEL|HAVAIANAS|CHINELO|CORTADOR|PORTA\s+COMPRIMID\w*|COMPRESSA|GAZE|ATADURA|ESPARADRAPO|MICROPORE|BAND[\s\-]*AID|BANDAID|CURATIVO|PINCA|ALICATE|LIXA|TESOURA|LUVA|AP\s+BARBA|APARELHO\s+DE?\s*BARB\w*|BARBEAR|GILLETTE|PRESTOBARBA|HIDRATANTE|HIDRAT|PROTETOR\s+SOLAR|REPELENTE|TESTE\s+DE?\s*GRAVIDEZ|PRESERVATIVO|ABSORVENTE|LENCO\s+UMED\w*|TOALHA\s+UMED\w*|AGUA\s+MICELAR|MOUSSE\s+LIMPEZ\w*|COREGA|FIXADOR\s+DENT\w*|SERINGA|AGULHA|TERMOMETRO|MEDIDOR\s+GLICOSE|TIRAS\s+REAGENTES|LANCETA|ALGODAO|COTONETE|CREME\s+DENTAL|PASTA\s+DENTE|ENXAGUANTE|FIO\s+DENTAL|LAVITAN|CENTRUM|CALCIONUTRI|REJUVIT|POLPA|WHEY|CREATINA|CESTA\s+FARMACIA|CICATRISOFT)\b/i;

// Conjunto de DCBs conhecidas para reconhecer quando a descrição traz explicitamente o princípio ativo
const DCBS_CONHECIDOS = new Set([
  ...Object.values(ABREVIACOES_PRINCIPIOS),
  ...Object.values(MAPA_MARCAS_REFERENCIA).flatMap(v => v.split(/\s*\+\s*/)).flatMap(v => v.split(/\s+/)),
  'OMEPRAZOL', 'PANTOPRAZOL', 'ESOMEPRAZOL', 'LANSOPRAZOL', 'RABEPRAZOL',
  'LOSARTANA', 'VALSARTANA', 'TELMISARTANA', 'OLMESARTANA', 'CANDESARTANA', 'ENALAPRIL', 'CAPTOPRIL', 'LISINOPRIL', 'RAMIPRIL',
  'ANLODIPINO', 'NIFEDIPINO', 'ATENOLOL', 'PROPRANOLOL', 'CARVEDILOL', 'METOPROLOL', 'NEBIVOLOL', 'BISOPROLOL',
  'HIDROCLOROTIAZIDA', 'FUROSEMIDA', 'ESPIRONOLACTONA', 'INDAPAMIDA', 'CLORTALIDONA',
  'METFORMINA', 'GLIBENCLAMIDA', 'GLICLAZIDA', 'GLIMEPIRIDA', 'DAPAGLIFLOZINA', 'EMPAGLIFLOZINA', 'SITAGLIPTINA', 'VILDAGLIPTINA',
  'ROSUVASTATINA', 'ATORVASTATINA', 'SINVASTATINA', 'PRAVASTATINA', 'EZETIMIBA', 'CIPROFIBRATO', 'FENOFIBRATO',
  'CLOPIDOGREL', 'RIVAROXABANA', 'APIXABANA', 'DABIGATRANA', 'VARFARINA', 'CILOSTAZOL',
  'DIPIRONA', 'PARACETAMOL', 'IBUPROFENO', 'NIMESULIDA', 'DICLOFENACO', 'CETOPROFENO', 'MELOXICAM', 'PIROXICAM',
  'NAPROXENO', 'TENOXICAM', 'CELECOXIBE', 'ETORICOXIBE', 'CETOROLACO', 'TRAMADOL', 'CODEINA',
  'AMOXICILINA', 'CLAVULANATO', 'AZITROMICINA', 'CEFALEXINA', 'CEFACLOR', 'CEFUROXIMA', 'CEFTRIAXONA',
  'CIPROFLOXACINO', 'LEVOFLOXACINO', 'MOXIFLOXACINO', 'NORFLOXACINO', 'SULFAMETOXAZOL', 'TRIMETOPRIMA', 'METRONIDAZOL',
  'SECNIDAZOL', 'TINIDAZOL', 'DOXICICLINA', 'TETRACICLINA', 'CLARITROMICINA', 'CLINDAMICINA', 'NITROFURANTOINA',
  'FLUCONAZOL', 'ITRACONAZOL', 'CETOCONAZOL', 'MICONAZOL', 'NISTATINA', 'TERBINAFINA', 'ACICLOVIR', 'ALBENDAZOL', 'MEBENDAZOL', 'IVERMECTINA', 'NITAZOXANIDA',
  'FLUOXETINA', 'SERTRALINA', 'ESCITALOPRAM', 'CITALOPRAM', 'PAROXETINA', 'VENLAFAXINA', 'DESVENLAFAXINA', 'DULOXETINA',
  'AMITRIPTILINA', 'NORTRIPTILINA', 'BUPROPIONA', 'TRAZODONA', 'MIRTAZAPINA', 'QUETIAPINA', 'RISPERIDONA', 'OLANZAPINA', 'HALOPERIDOL',
  'CLONAZEPAM', 'ALPRAZOLAM', 'DIAZEPAM', 'BROMAZEPAM', 'LORAZEPAM', 'ZOLPIDEM', 'PREGABALINA', 'GABAPENTINA',
  'TOPIRAMATO', 'CARBAMAZEPINA', 'OXCARBAZEPINA', 'DIVALPROATO', 'VALPROATO', 'LAMOTRIGINA', 'LEVETIRACETAM', 'FENITOINA', 'FENOBARBITAL',
  'LORATADINA', 'DESLORATADINA', 'FEXOFENADINA', 'CETIRIZINA', 'LEVOCETIRIZINA', 'DEXCLORFENIRAMINA', 'PROMETAZINA', 'HIDROXIZINA', 'BILASTINA',
  'PREDNISONA', 'PREDNISOLONA', 'DEXAMETASONA', 'BETAMETASONA', 'HIDROCORTISONA', 'BECLOMETASONA', 'BUDESONIDA', 'MOMETASONA', 'FLUTICASONA',
  'SALBUTAMOL', 'ACEBROFILINA', 'AMBROXOL', 'BROMEXINA', 'ACETILCISTEINA', 'CARBOCISTEINA', 'OXOMEMAZINA', 'DROPROPIZINA', 'LEVODROPROPIZINA',
  'BROMOPRIDA', 'METOCLOPRAMIDA', 'DOMPERIDONA', 'ONDANSETRONA', 'DIMENIDRINATO', 'SIMETICONA', 'LOPERAMIDA', 'ESCOPOLAMINA', 'BISACODIL', 'LACTULOSE',
  'BETAISTINA', 'FLUNARIZINA', 'CINARIZINA', 'TADALAFILA', 'SILDENAFILA', 'DOXAZOSINA', 'TANSULOSINA', 'FINASTERIDA', 'DUTASTERIDA',
  'ALOPURINOL', 'COLCHICINA', 'CICLOBENZAPRINA', 'CARISOPRODOL', 'ORFENADRINA', 'LEVOTIROXINA', 'ALENDRONATO',
  'NEOMICINA', 'BACITRACINA', 'TOBRAMICINA', 'GENTAMICINA', 'MUPIROCINA', 'COLAGENASE', 'ESTRIOL',
  'DESOGESTREL', 'LEVONORGESTREL', 'ETINILESTRADIOL', 'DROSPIRENONA', 'CIPROTERONA', 'ALGESTONA', 'ESTRADIOL',
  'COLECALCIFEROL', 'CIANOCOBALAMINA', 'TIAMINA', 'PIRIDOXINA', 'BIOTINA', 'DIOSMINA', 'HESPERIDINA', 'LIDOCAINA'
]);

function normalizarTextoSimples(txt) {
  if (!txt || typeof txt !== 'string') return '';
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s\.\,\+\-\/\%\;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatarNumero(num) {
  const n = Number(num);
  if (!isFinite(n)) return '0';
  return Number(n.toFixed(4)).toString();
}

/**
 * Limpa ruídos operacionais do Digifarma/distribuidoras mantendo dosagem, forma e ativos legíveis.
 */
function limparTextoRuido(txt) {
  let norm = normalizarTextoSimples(txt);
  if (!norm) return '';

  // Remove metadados de lote, GTIN, descontos e datas
  norm = norm
    .replace(/\bLOTE(?:\s*\(S\))?\s*:.*$/gi, ' ')
    .replace(/\bGTIN\s*:\s*\d+/gi, ' ')
    .replace(/%D[FN]\s*:\s*[\d.,]+/gi, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' ')
    .replace(/\(\s*[ABC][12]\s*\)/gi, ' ')
    .replace(/\*[ABC][12]\b/gi, ' ')
    .replace(/\/[ABC][12]\b/gi, ' ')
    .replace(/\(\s*[GE]\s*\)/gi, ' ')
    .replace(/\(\s*[+\-]\s*\)/gi, ' ')
    .replace(/^\s*(?:\(IF\)|FP|GEN|GN)\s+/i, '')
    .replace(/^[#*\-\s]+/, '');

  // Corrige erros comuns de digitação em receitas/cadastros (ex: "16 MC/ 30 CPR" -> "16MG C/ 30 CPR")
  norm = norm
    .replace(/\b(\d+(?:[.,]\d+)?)\s*MC\s*\/\s*(?=\d)/gi, '$1MG C/ ')
    .replace(/\b(\d+(?:[.,]\d+)?)\s*M\s*(C\/|CPR|COMP|\/)/gi, '$1MG $2');

  // Remove separador de milhar de grandes dosagens (ex: 1.200.000 UI -> 1200000 UI, 15.000UI -> 15000UI)
  norm = norm.replace(/\b([1-9]\d{0,2}(?:\.\d{3})+)(?=\s*(?:UI|MG|MCG|G|ML)\b)/gi, (_, numStr) => numStr.replace(/\./g, ''));

  // Separa números colados de unidades e apenas laboratórios colados após forma (ex: 30CPRLEGRAND -> 30 CPR LEGRAND)
  norm = norm
    .replace(/(\d)(CPR|COMPR|COMP|CPS|CAPS|CAP|DRG|ENV|SACHE|FLAC|AMP|MG|MCG|ML|UI|GR)\b/gi, '$1 $2')
    .replace(/\b(CPR|COMPR|COMP|CP|CPS|CAPS|CAP|DRG)(LEGRAND|EMS|MEDLEY|EUROFARMA|EUROF|TEUTO|GERMED|CIMED|GLOBO|GEOLAB|PRATI|ACHE|SANDOZ|PHARLAB|VITAMEDIC|TORRENT|BIOSINT|BIOLAB|NEO|NOVA|MEDQ|BELFAR|RANBAXY|ZYDUS)\b/gi, '$1 $2')
    .replace(/\b(X)(\d+)/gi, 'X $2')
    .replace(/\b(C\/)(\d+)/gi, 'C/ $2')
    .replace(/\s+/g, ' ')
    .trim();

  return norm;
}

/**
 * Detecta laboratório pelo texto, sufixos de distribuidora e prefixo EAN.
 */
function detectarLaboratorio(normLimpo, ean) {
  for (const lab of LABS_ORDENADOS) {
    const escaped = lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\s|\\-|\\()${escaped}(?:$|\\s|\\)|\\-)`, 'i').test(normLimpo)) {
      if (lab === 'MEDQUIMIC' || lab === 'MEDQ' || lab === 'MDQ') return 'MEDQUIMICA';
      if (lab === 'NEOQUIMICA' || lab === 'NEO QUI' || lab === 'NEO QUIMIC' || lab === 'N.Q' || lab === 'NEO G') return 'NEO QUIMICA';
      if (lab === 'NOVAQUI' || lab === 'NVQ' || lab === 'NOVQ') return 'NOVA QUIMICA';
      if (lab === 'EUROF' || lab === 'EGF') return 'EUROFARMA';
      if (lab === 'GERM') return 'GERMED';
      if (lab === 'TEU' || lab === 'TUG' || lab === 'TUS') return 'TEUTO';
      if (lab === 'LEG') return 'LEGRAND';
      if (lab === 'GLG') return 'GLOBO';
      if (lab === 'GEO') return 'GEOLAB';
      if (lab === 'PRT' || lab === 'PRATI DONADUZZI') return 'PRATI';
      if (lab === 'RBX') return 'RANBAXY';
      if (lab === 'BIOSINT' || lab === 'BIO') return 'BIOSINTETICA';
      if (lab === 'BLF') return 'BELFAR';
      if (lab === 'BRAINFAR') return 'BRAINFARMA';
      if (lab === 'MERK') return 'MERCK';
      if (lab === 'MDL') return 'MEDLEY';
      if (lab === 'ACH') return 'ACHE';
      if (lab === 'VTS') return 'VITAMEDIC';
      if (lab === 'NAL') return 'NATULAB';
      if (lab === 'FAX') return 'FARMAX';
      return lab;
    }
  }

  // Sufixos tipo "-GLG", "-TUG", "-EMS", "-GL"
  const sufixoMatch = /(?:^|\s)-([A-Z]{2,4})\b/.exec(normLimpo);
  if (sufixoMatch && SUFIXOS_LAB_MAP[sufixoMatch[1]]) {
    return SUFIXOS_LAB_MAP[sufixoMatch[1]];
  }

  if (ean) {
    const eanStr = String(ean).replace(/\D/g, '');
    for (const [pfx, lab] of Object.entries(EAN_PREFIX_LABS)) {
      if (eanStr.startsWith(pfx)) return lab;
    }
  }
  return null;
}

/**
 * Remove nomes e códigos de laboratórios do texto para isolar princípio ativo e dosagem.
 */
function removerLaboratoriosDoTexto(normLimpo) {
  let out = normLimpo;
  for (const lab of LABS_ORDENADOS) {
    const escaped = lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(?:^|\\s|\\-|\\()${escaped}(?=$|\\s|\\)|\\-)`, 'gi'), ' ');
  }
  out = out.replace(/-[A-Z0-9]{1,4}\b/gi, ' ');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Detecta forma farmacêutica e modificador de liberação/via.
 */
function detectarFormaEModificador(normSemLab) {
  let forma = 'COMP/CAPS';
  if (/\b(?:CR(?:EME)?\s*VAG(?:INAL)?|VAG(?:INAL)?\s*CR(?:EME)?|CREME\s+VAG)\b/.test(normSemLab)) {
    forma = 'CREME_VAGINAL';
  } else if (/\b(?:COLIRIO|OFT|OFTALMICO|OFTALMICA)\b/.test(normSemLab)) {
    forma = 'OFTALMICO';
  } else if (/\b(?:OTOL|OTOLOGICO|OTOLOGICA)\b/.test(normSemLab)) {
    forma = 'OTOLOGICO';
  } else if (/\b(?:NASAL|SPRAY\s+NASAL)\b/.test(normSemLab)) {
    forma = 'NASAL';
  } else if (/\b(?:GOTAS|GTS)\b/.test(normSemLab)) {
    forma = 'GOTAS';
  } else if (/\b(?:XPE|XAROPE)\b/.test(normSemLab)) {
    forma = 'XAROPE';
  } else if (/\b(?:SUSP|SUS|SUSPENSAO)\b/.test(normSemLab)) {
    forma = 'SUSPENSAO';
  } else if (/\b(?:SOL(?:UCAO)?\s+OR(?:AL)?|ELIXIR)\b/.test(normSemLab)) {
    forma = 'SOLUCAO_ORAL';
  } else if (/\b(?:POM|PDA|POMADA)\b/.test(normSemLab)) {
    forma = 'POMADA';
  } else if (/\b(?:CREME|CRM|CR)\b/.test(normSemLab) && !/\b(?:CPR|COMPR|COMP|CAPS|CPS)\b/.test(normSemLab)) {
    forma = 'CREME';
  } else if (/\bGEL\b/.test(normSemLab) && !/\bCAPS?\s+GEL\b/.test(normSemLab)) {
    forma = 'GEL';
  } else if (/\b(?:INJ|INJETAVEL|AMP|AMPOLA)\b/.test(normSemLab)) {
    forma = 'INJETAVEL';
  } else if (/\b(?:SPRAY|SPR|AER|AEROSSOL)\b/.test(normSemLab)) {
    forma = 'SPRAY';
  } else if (/\b(?:PAST|PASTILHA)\b/.test(normSemLab)) {
    forma = 'PASTILHA';
  } else if (/\b(?:SUP|SUPOSITORIO)\b/.test(normSemLab)) {
    forma = 'SUPOSITORIO';
  } else if (/\b(?:ENV|ENVELOPE|SACH|SACHE)\b/.test(normSemLab) && !/\b(?:CPR|COMPR|COMP)\b/.test(normSemLab)) {
    forma = 'SACHE_PO';
  } else if (/\b(?:CPS|CAPS|CAP|CAPSULA|CAPSULAS)\b/.test(normSemLab)) {
    forma = 'CÁPSULA';
  } else if (/\b(?:CPR|COMPR|COMP|CP|COMPRIMIDO|COMPRIMIDOS|DRG|DRAGEA)\b/.test(normSemLab)) {
    forma = 'COMPRIMIDO';
  } else if (/\b\d+\s*ML\b/.test(normSemLab) && !/\b\d+\s*(?:CPR|COMPR|COMP|CP|CAPS|CPS)\b/.test(normSemLab)) {
    forma = 'SOLUCAO_ORAL';
  } else if (/\b\d+\s*(?:GR|G)\b/.test(normSemLab) && !/\b(?:EFERV|CPR|COMPR|COMP|CP|CAPS|CPS|ENV|SACHE|INJ)\b/.test(normSemLab)) {
    // Ex: "NEOMICINA+BACITRACINA 10 GR" sem palavra POMADA explícita -> se é tópico/bisnaga, inferimos POMADA
    const valG = /\b(\d+(?:[.,]\d+)?)\s*(?:GR|G)\b/.exec(normSemLab);
    if (valG && parseFloat(valG[1].replace(',', '.')) >= 5) {
      forma = 'POMADA';
    }
  }

  const formaChave = (forma === 'COMPRIMIDO' || forma === 'CÁPSULA' || forma === 'COMP/CAPS')
    ? 'SOLIDO_ORAL'
    : forma;

  // Modificadores críticos de farmacocinética / via que NUNCA podem se misturar com liberação normal.
  // Atenção: "\bCR\b" só significa Controlled Release em formas sólidas orais (nunca em Creme / Creme Vaginal).
  const mods = [];
  const temCrSolido = formaChave === 'SOLIDO_ORAL' && /\bCR\b/.test(normSemLab);
  if (temCrSolido || /\b(?:XR|SR|LP|LA|OD|AP|RETARD|PROLONG|PROLONGADA|PROLONGADO)\b/.test(normSemLab)) mods.push('XR');
  if (/\b(?:SUBL|SUBLINGUAL|SL)\b/.test(normSemLab)) mods.push('SUBL');
  if (/\b(?:EFERV|EFERVESCENTE)\b/.test(normSemLab)) mods.push('EFERV');
  if (/\b(?:MAST|MASTIG|MASTIGAVEL)\b/.test(normSemLab)) mods.push('MAST');
  if (/\b(?:ODT|ORODISP|ORODISPERSIVEL|DISPERSIVEL|FLASH)\b/.test(normSemLab)) mods.push('ODT');

  const modificador = mods.join('+');

  return { forma, formaChave, modificador };
}

/**
 * Extrai e normaliza dosagem (simples ou associada) evitando confundir peso de bisnaga (15G/30G) ou volume de frasco (120ML).
 */
function extrairDosagemNormalizada(normSemLab, forma) {
  const isTopico = forma === 'POMADA' || forma === 'CREME' || forma === 'CREME_VAGINAL' || forma === 'GEL';
  const isLiquido = forma === 'GOTAS' || forma === 'XAROPE' || forma === 'SUSPENSAO' || forma === 'SOLUCAO_ORAL' ||
    forma === 'OFTALMICO' || forma === 'NASAL' || forma === 'OTOLOGICO' || forma === 'SPRAY';

  // 1. Padrão de concentração /5ML com 2 componentes: "2 MG/5 ML+0.25 MG/5 ML"
  const conc5MlDupla = /(\d+(?:[.,]\d+)?)\s*MG\s*\/\s*5\s*ML\s*\+\s*(\d+(?:[.,]\d+)?)\s*MG\s*\/\s*5\s*ML/i.exec(normSemLab);
  if (conc5MlDupla) {
    const d1 = formatarNumero(parseFloat(conc5MlDupla[1].replace(',', '.')) / 5);
    const d2 = formatarNumero(parseFloat(conc5MlDupla[2].replace(',', '.')) / 5);
    return `${d1}+${d2}MG/ML`;
  }

  // 2. Padrão de concentração /5ML composto "400+57 MG/5 ML" ou "400/57MG/5ML"
  const conc5MlComp = /(\d+(?:[.,]\d+)?)\s*[\+\/]\s*(\d+(?:[.,]\d+)?)\s*MG\s*\/\s*5\s*ML/i.exec(normSemLab);
  if (conc5MlComp) {
    const d1 = formatarNumero(parseFloat(conc5MlComp[1].replace(',', '.')) / 5);
    const d2 = formatarNumero(parseFloat(conc5MlComp[2].replace(',', '.')) / 5);
    return `${d1}+${d2}MG/ML`;
  }

  // 3. Padrão de concentração /5ML simples: "4 MG/5ML", "250MG/5ML"
  const conc5MlSimples = /(\d+(?:[.,]\d+)?)\s*MG\s*\/\s*5\s*ML\b/i.exec(normSemLab);
  if (conc5MlSimples) {
    const d1 = formatarNumero(parseFloat(conc5MlSimples[1].replace(',', '.')) / 5);
    return `${d1}MG/ML`;
  }

  // 4. Associação composta explícita: "0,4+0,05 MG/ML", "875+125MG", "50MG+12,5MG", "5MG+250UI", "150+10 MG/ML"
  const assocMatch = /(\d+(?:[.,]\d+)?)\s*(MG|MCG|UI|G)?\s*\+\s*(\d+(?:[.,]\d+)?)\s*(MG\/ML|MCG\/ML|MG\/G|MG|MCG|UI|G)\b/i.exec(normSemLab);
  if (assocMatch) {
    const n1 = formatarNumero(parseFloat(assocMatch[1].replace(',', '.')));
    const u1 = assocMatch[2] ? assocMatch[2].toUpperCase() : '';
    const n2 = formatarNumero(parseFloat(assocMatch[3].replace(',', '.')));
    const u2 = assocMatch[4].toUpperCase();
    // Se u1 e u2 são iguais (ex: MG e MG) ou u1 ausente, compacta como "n1+n2U2"
    if (!u1 || u1 === u2 || (u1 === 'MG' && u2 === 'MG/ML')) {
      return `${n1}+${n2}${u2}`;
    }
    return `${n1}${u1}+${n2}${u2}`;
  }

  // 5. Concentração com barra explícita: "2000 MCG/ML", "3,0 MG/ML", "20 MG/G", "0,5%"
  const concMatch = /(\d+(?:[.,]\d+)?)\s*(MG\/ML|MCG\/ML|G\/ML|MG\/G|MCG\/G|%)\b/i.exec(normSemLab);
  if (concMatch) {
    const n = formatarNumero(parseFloat(concMatch[1].replace(',', '.')));
    return `${n}${concMatch[2].toUpperCase()}`;
  }

  // 6. Dosagem padrão (MG, MCG, UI, G).
  // Em tópicos/líquidos, G e ML representam peso/volume da embalagem, NÃO dosagem!
  const unitRegex = isTopico
    ? /(\d+(?:[.,]\d+)?)\s*(MG|MCG|UI)\b/i
    : (isLiquido
        ? /(\d+(?:[.,]\d+)?)\s*(MG|MCG|UI)\b/i
        : /(\d+(?:[.,]\d+)?)\s*(MG|MCG|UI|G)\b/i);

  const match = unitRegex.exec(normSemLab);
  if (match) {
    let val = parseFloat(match[1].replace(',', '.'));
    let unit = match[2].toUpperCase();

    // Converte 1G -> 1000MG (sólidos/injetáveis/eferv), exceto valores gigantes
    if (unit === 'G' && val <= 5) {
      val = val * 1000;
      unit = 'MG';
    }
    // Converte microdoses < 0.1MG para MCG (ex: 0,075 MG == 75 MCG)
    if (unit === 'MG' && val > 0 && val < 0.1) {
      val = Math.round(val * 1000 * 100) / 100;
      unit = 'MCG';
    }

    let doseFinal = `${formatarNumero(val)}${unit}`;
    // Em líquidos com "50 MG C/ 100 ML" (sem "/ML" explícito), geralmente significa 50MG/ML (ex: Dipirona Xpe 50mg)
    if (isLiquido && (unit === 'MG' || unit === 'MCG') && /\bC\/\s*\d+\s*ML\b/i.test(normSemLab)) {
      doseFinal = `${formatarNumero(val)}${unit}`;
    }
    return doseFinal;
  }

  return '';
}

/**
 * Extrai quantidade de unidades (sólidos/ampolas/envelopes) ou volume/peso (líquidos/tópicos).
 */
function extrairEmbalagem(normSemLab, forma) {
  const isTopico = forma === 'POMADA' || forma === 'CREME' || forma === 'CREME_VAGINAL' || forma === 'GEL';
  const isLiquido = forma === 'GOTAS' || forma === 'XAROPE' || forma === 'SUSPENSAO' || forma === 'SOLUCAO_ORAL' ||
    forma === 'OFTALMICO' || forma === 'NASAL' || forma === 'OTOLOGICO' || forma === 'SPRAY';

  // Líquidos: extrai volume em ML (ignorando /ML e /5ML de concentração)
  if (isLiquido) {
    const semConc = normSemLab
      .replace(/\/\s*5?\s*ML\b/gi, ' ')
      .replace(/\bMG\/ML\b/gi, ' ');
    const mlMatch = /(?:C\/|FR|X|COM)?\s*(\d+(?:[.,]\d+)?)\s*ML\b/i.exec(semConc);
    if (mlMatch) {
      const vol = formatarNumero(parseFloat(mlMatch[1].replace(',', '.')));
      return { unidades: 1, unidadesChave: `${vol}ML`, volumeTexto: `${vol}ML` };
    }
  }

  // Tópicos: extrai peso da bisnaga em G/GR (ignorando MG/G)
  if (isTopico) {
    const semConc = normSemLab.replace(/\/\s*G\b/gi, ' ');
    const gMatch = /(?:C\/|BG|X|COM)?\s*(\d+(?:[.,]\d+)?)\s*(?:GR|G)\b/i.exec(semConc);
    if (gMatch) {
      const peso = formatarNumero(parseFloat(gMatch[1].replace(',', '.')));
      return { unidades: 1, unidadesChave: `${peso}G`, volumeTexto: `${peso}G` };
    }
  }

  // Sólidos, injetáveis, sachês, pastilhas, supositórios
  let unidades = 1;
  // Evita confundir "400+57" ou "10 MG X 20" — só multiplica quando nenhum dos lados é dosagem
  const multMatch = /\b(\d{1,2})\s*(?:BL\s*)?[Xx]\s*(\d{1,3})\s*(?:CPS|CP|CPR|COMPR|COMP|CAPS|CAP|FLAC|AMP|ENV|SACH|SACHE|DRG|UNID|UN)?\b/i.exec(
    normSemLab.replace(/\d+(?:[.,]\d+)?\s*(?:MG|MCG|G|ML|UI|%)(?:\/\d*\s*(?:ML|G))?/gi, ' ')
  );
  if (multMatch) {
    const a = parseInt(multMatch[1], 10);
    const b = parseInt(multMatch[2], 10);
    if (a > 0 && b > 0 && a * b <= 500) {
      unidades = a * b;
    }
  } else {
    const semDose = normSemLab.replace(/\d+(?:[.,]\d+)?\s*(?:MG|MCG|UI|%)(?:\/\d*\s*(?:ML|G))?/gi, ' ');
    const unMatch =
      /(?:C\/|CX\/|COM)\s*0*(\d{1,3})\s*(?:CPS|CP|CPR|COMPR|COMP|CAPS|CAP|FLAC|AMP|ENV|SACH|SACHE|TB|DRG|PAST|SUP|UNID|UN)?\b/i.exec(semDose) ||
      /\bX\s*0*(\d{1,3})\s*(?:CPS|CP|CPR|COMPR|COMP|CAPS|CAP|COM|FLAC|AMP|ENV|SACH|SACHE|DRG|PAST|SUP|UNID|UN)\b/i.exec(semDose) ||
      /\b0*(\d{1,3})\s*(?:CPS|CP|CPR|COMPR|COMP|CAPS|CAP|FLAC|AMP|ENV|SACH|SACHE|DRG|PAST|SUP)\b/i.exec(semDose);
    if (unMatch) {
      unidades = parseInt(unMatch[1], 10) || 1;
    }
  }

  const isSolidoOral = forma === 'COMPRIMIDO' || forma === 'CÁPSULA' || forma === 'COMP/CAPS';
  const isMensal = (unidades === 28 || unidades === 30) && isSolidoOral;
  const unidadesChave = isMensal ? '28-30' : String(unidades);

  return { unidades, unidadesChave, volumeTexto: null };
}

/**
 * Normaliza e canoniza um texto de princípio ativo (ou lista separada por ';' ou '+').
 */
function normalizarPrincipioAtivo(rawTexto, contextoCompleto = '') {
  if (!rawTexto || typeof rawTexto !== 'string') return 'OUTROS';

  const limpo = normalizarTextoSimples(rawTexto)
    .replace(/\b(CLORIDR\.?|CLOR\.?|HCL)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!limpo) return 'OUTROS';

  // Divide componentes em associações (';' ou '+' ou '/' entre letras)
  const partesBrutas = limpo
    .split(/\s*[;+]\s*|\s*\/\s*(?=[A-Z]{3,})/)
    .map(p => p.trim())
    .filter(Boolean);

  const componentesCanonicos = [];

  for (const parte of partesBrutas) {
    // Checa se a parte inteira é uma marca mapeada
    const primeira = parte.split(/\s+/)[0];
    if (MAPA_MARCAS_REFERENCIA[primeira]) {
      for (const comp of MAPA_MARCAS_REFERENCIA[primeira].split(/\s*\+\s*/)) {
        if (!componentesCanonicos.includes(comp)) componentesCanonicos.push(comp);
      }
      continue;
    }

    const tokensRaw = parte
      .replace(/[^A-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !/^\d+$/.test(w) && !STOPWORDS_DESCRICAO.has(w));

    if (tokensRaw.length === 0) continue;

    // Expande abreviações token a token
    const tokensExpandidos = tokensRaw.map(t => ABREVIACOES_PRINCIPIOS[t] || t);

    // Verifica casos onde o sal É clinicamente diferenciador!
    const ctxUpper = `${parte} ${contextoCompleto}`.toUpperCase();
    if (tokensExpandidos.includes('DICLOFENACO')) {
      if (/\bPOTASSIC[OA]?\b|\bCATAFLAM\b/.test(ctxUpper)) {
        componentesCanonicos.push('DICLOFENACO POTASSICO');
      } else if (/\bDIETILAMONIO\b/.test(ctxUpper)) {
        componentesCanonicos.push('DICLOFENACO DIETILAMONIO');
      } else if (/\bCOLESTIRAMINA\b/.test(ctxUpper)) {
        componentesCanonicos.push('DICLOFENACO COLESTIRAMINA');
      } else if (/\bRESINATO\b/.test(ctxUpper)) {
        componentesCanonicos.push('DICLOFENACO RESINATO');
      } else {
        componentesCanonicos.push('DICLOFENACO SODICO');
      }
      continue;
    }

    if (tokensExpandidos.includes('METOPROLOL')) {
      if (/\bTARTARAT[OA]\b|\bSELOPRESS\b/.test(ctxUpper)) {
        componentesCanonicos.push('METOPROLOL TARTARATO');
      } else {
        componentesCanonicos.push('METOPROLOL SUCCINATO');
      }
      continue;
    }

    if (tokensExpandidos.includes('NIMESULIDA')) {
      if (/\bBETA\b|\bBETACICLODEXTRINA\b/.test(ctxUpper)) {
        componentesCanonicos.push('NIMESULIDA BETACICLODEXTRINA');
      } else {
        componentesCanonicos.push('NIMESULIDA');
      }
      continue;
    }

    if (tokensExpandidos[0] === 'VITAMINA' && tokensExpandidos.length >= 2) {
      componentesCanonicos.push(`VITAMINA ${tokensExpandidos[1]}`);
      continue;
    }

    if (tokensExpandidos[0] === 'ACIDO' && tokensExpandidos.length >= 2) {
      const comp = tokensExpandidos[1] === 'ACETIL' ? 'ACETILSALICILICO' : tokensExpandidos[1];
      componentesCanonicos.push(`ACIDO ${comp}`);
      continue;
    }

    if (tokensExpandidos[0] === 'OXIDO' && tokensExpandidos[1] === 'DE' && tokensExpandidos[2]) {
      componentesCanonicos.push(`OXIDO DE ${tokensExpandidos[2]}`);
      continue;
    }

    // Remove sais neutros
    const semSais = tokensExpandidos.filter(t => !SAIS_NEUTROS.has(t));
    const finalTokens = semSais.length > 0 ? semSais : tokensExpandidos;

    if (finalTokens.length > 0) {
      // Para princípio único em texto livre (ex: "CLOPIDOGREL"), pega o primeiro token de fármaco válido
      let candidato = finalTokens[0];
      if (finalTokens.length >= 2 && (finalTokens[0] === 'ACIDO' || finalTokens[0] === 'VITAMINA')) {
        candidato = `${finalTokens[0]} ${finalTokens[1]}`;
      }
      if (candidato.length >= 3 && !componentesCanonicos.includes(candidato)) {
        componentesCanonicos.push(candidato);
      }
    }
  }

  const unicosOrdenados = [...new Set(componentesCanonicos)].sort();
  if (unicosOrdenados.length === 0) return 'OUTROS';
  return unicosOrdenados.join(' + ');
}

/**
 * Extrai princípio ativo diretamente do texto limpo da descrição/apresentação.
 */
function extrairPrincipioDaDescricao(normSemLab, contextoCompleto) {
  // Remove dosagens, concentrações, embalagens e palavras de forma
  let textoLimpo = normSemLab
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:MG\/5?\s*ML|MCG\/5?\s*ML|G\/ML|MG\/G|MG|MCG|UI|ML|GR|G|%)\b/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*\+\s*\d+(?:[.,]\d+)?\s*(?:MG\/5?\s*ML|MG|MCG|UI)?\b/gi, ' ')
    .replace(/\b\d+\s*(?:BL\s*)?[Xx]\s*\d+\b/gi, ' ')
    .replace(/(?:C\/|CX\/|COM)\s*\d+\b/gi, ' ')
    .replace(/\bX\s*\d+\b/gi, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Checa marca de referência na primeira palavra (ex: FORXIGA -> DAPAGLIFLOZINA)
  const primeiraPalavra = textoLimpo.split(' ')[0];
  if (primeiraPalavra && MAPA_MARCAS_REFERENCIA[primeiraPalavra]) {
    return {
      principio: normalizarPrincipioAtivo(MAPA_MARCAS_REFERENCIA[primeiraPalavra], contextoCompleto),
      confiancaAlta: true
    };
  }

  // 2. Se houver associação explícita com '+', preserva a expressão inteira dos dois lados
  if (textoLimpo.includes('+')) {
    // Limpa tokens que não pertencem ao fármaco mas preserva o '+'
    const partes = textoLimpo.split('+').map(p => {
      const toks = p.replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_DESCRICAO.has(w));
      return toks.slice(0, 2).join(' ');
    }).filter(Boolean);
    if (partes.length >= 2) {
      const princip = normalizarPrincipioAtivo(partes.join(' + '), contextoCompleto);
      const confiancaAlta = partes.some(p => {
        const exp = ABREVIACOES_PRINCIPIOS[p.split(' ')[0]] || p.split(' ')[0];
        return DCBS_CONHECIDOS.has(exp);
      });
      return { principio: princip, confiancaAlta };
    }
  }

  // 3. Procura DCB explícita entre parênteses ou após hífen (ex: "ALBEL 400 MG (ALBENDAZOL)" ou "LORITIL - LORATADINA")
  const parenMatch = /\(([^)]+)\)/.exec(textoLimpo);
  if (parenMatch) {
    const toksParen = parenMatch[1].replace(/[^A-Z0-9\s\+]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS_DESCRICAO.has(w));
    const dcbParen = toksParen.find(t => DCBS_CONHECIDOS.has(ABREVIACOES_PRINCIPIOS[t] || t));
    if (dcbParen) {
      return {
        principio: normalizarPrincipioAtivo(toksParen.join(' '), contextoCompleto),
        confiancaAlta: true
      };
    }
  }

  // 4. Tokenização padrão filtrando stopwords
  const tokens = textoLimpo.replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS_DESCRICAO.has(w));

  if (tokens.length === 0) {
    return { principio: 'OUTROS', confiancaAlta: false };
  }

  // Se a primeira palavra não for DCB conhecida, verifica se existe alguma DCB conhecida depois na frase (ex: "COXYM COLCHICINA")
  const primExp = ABREVIACOES_PRINCIPIOS[tokens[0]] || tokens[0];
  if (!DCBS_CONHECIDOS.has(primExp) && tokens.length > 1) {
    const dcbEncontrada = tokens.find(t => DCBS_CONHECIDOS.has(ABREVIACOES_PRINCIPIOS[t] || t));
    if (dcbEncontrada) {
      return {
        principio: normalizarPrincipioAtivo(dcbEncontrada, contextoCompleto),
        confiancaAlta: true
      };
    }
  }

  // Trata "ACIDO ..." e "VITAMINA ..." que exigem 2 palavras
  const fatia = (tokens[0] === 'ACIDO' || tokens[0] === 'VITAMINA')
    ? tokens.slice(0, 3).join(' ')
    : (SAIS_NEUTROS.has(tokens[0]) && tokens.length >= 2 ? tokens.slice(0, 3).join(' ') : tokens.slice(0, 2).join(' '));

  const princip = normalizarPrincipioAtivo(fatia, contextoCompleto);
  const tokensPrincip = princip.split(/[\s+]+/).filter(Boolean);
  const confiancaAlta = tokensPrincip.some(t => DCBS_CONHECIDOS.has(t) || Boolean(MAPA_MARCAS_REFERENCIA[t]));

  return { principio: princip, confiancaAlta };
}

/**
 * Extrai atributos completos de padronização farmacêutica.
 * Aceita `(nome)` ou `(nome, { apresentacao, substanciaNome, categoriaId, ean })`.
 */
function extrairAtributosProduto(nome, opcoes = {}) {
  const opts = (opcoes && typeof opcoes === 'object') ? opcoes : {};
  const descStr = String(nome || '').trim();
  const apresStr = String(opts.apresentacao || '').trim();
  const categoriaId = opts.categoriaId !== undefined && opts.categoriaId !== null ? Number(opts.categoriaId) : 0;
  const substanciaRaw = opts.substanciaNome ? String(opts.substanciaNome).trim() : '';
  const ean = opts.ean ? String(opts.ean).trim() : null;

  if (!descStr && !apresStr) {
    return {
      principio: 'OUTROS',
      dosagem: '',
      unidades: 1,
      unidadesChave: '1',
      forma: 'UN',
      formaChave: 'UN',
      modificador: '',
      laboratorio: null,
      isMedicamento: false,
      chave: null,
      chaveSemDose: null
    };
  }

  const textoCombinado = apresStr && !descStr.toUpperCase().includes(apresStr.toUpperCase())
    ? `${descStr} ${apresStr}`
    : (descStr || apresStr);

  const normLimpo = limparTextoRuido(textoCombinado);
  const isPerfumaria = categoriaId === CATEGORIAS_DIGIFARMA.PERFUMARIA;
  const hitBlacklist = BLACKLIST_NAO_MEDICAMENTO_REGEX.test(normLimpo);

  const laboratorio = detectarLaboratorio(normLimpo, ean);
  const normSemLab = removerLaboratoriosDoTexto(normLimpo);
  let { forma, formaChave, modificador } = detectarFormaEModificador(normSemLab);
  let dosagem = extrairDosagemNormalizada(normSemLab, forma);
  let embalagem = extrairEmbalagem(normSemLab, forma);

  // Extrai princípio da descrição para referência / fallback / verificação de sanidade
  const descLimpa = limparTextoRuido(descStr || textoCombinado);
  const descSemLab = removerLaboratoriosDoTexto(descLimpa);
  const fromDesc = extrairPrincipioDaDescricao(descSemLab, normLimpo);

  let principio = fromDesc.principio;
  let origemPrincipio = 'descricao';

  if (substanciaRaw) {
    const fromSub = normalizarPrincipioAtivo(substanciaRaw, normLimpo);
    if (fromSub && fromSub !== 'OUTROS') {
      // Validação de sanidade anti-cadastro-corrompido no Digifarma:
      // Se a descrição identificou com alta confiança uma marca/DCB conhecida e ela NÃO tem interseção com substancia_nome,
      // descarta a substancia_nome corrompida (ex: PROFERGAN CRM com NORETISTERONA no cadastro Digifarma).
      if (fromDesc.confiancaAlta && fromDesc.principio !== 'OUTROS') {
        const toksDesc = new Set(fromDesc.principio.split(/[\s+]+/).filter(w => w.length >= 4));
        const toksSub = new Set(fromSub.split(/[\s+]+/).filter(w => w.length >= 4));
        const temIntersecao = [...toksDesc].some(t => toksSub.has(t));
        if (temIntersecao) {
          principio = fromSub;
          origemPrincipio = 'digifarma_substancia';
        } else {
          principio = fromDesc.principio;
          origemPrincipio = 'descricao_override_corrompida';
          // Quando o vínculo de substância/apresentação no Digifarma está corrompido, recalcula atributos apenas pela descrição
          const formaDesc = detectarFormaEModificador(descSemLab);
          forma = formaDesc.forma;
          formaChave = formaDesc.formaChave;
          modificador = formaDesc.modificador;
          dosagem = extrairDosagemNormalizada(descSemLab, forma);
          embalagem = extrairEmbalagem(descSemLab, forma);
        }
      } else {
        principio = fromSub;
        origemPrincipio = 'digifarma_substancia';
      }
    }
  }

  const textoCheckForma = origemPrincipio === 'descricao_override_corrompida' ? descSemLab : normSemLab;
  const temFormaFarma = forma !== 'COMP/CAPS' || /\b(?:CPR|COMPR|COMP|CP|CAPS|CPS|CAP|COMPRIMID\w*|CAPSUL\w*|DRG)\b/.test(textoCheckForma);
  const isCategoriaMed = categoriaId === CATEGORIAS_DIGIFARMA.REFERENCIA ||
    categoriaId === CATEGORIAS_DIGIFARMA.SIMILAR ||
    categoriaId === CATEGORIAS_DIGIFARMA.GENERICO;

  const principioValido = Boolean(principio && principio !== 'OUTROS' && principio.length >= 3);
  const isMedicamento = Boolean(
    !isPerfumaria &&
    !hitBlacklist &&
    principioValido &&
    (isCategoriaMed || Boolean(substanciaRaw) || Boolean(dosagem) || temFormaFarma || fromDesc.confiancaAlta)
  );

  // Para compatibilidade de assinatura/chaves com consumidores legados e testes:
  // A chave canônica unifica COMPRIMIDO/CÁPSULA/COMP/CAPS como SOLIDO_ORAL.
  let chave = null;
  let chaveSemDose = null;
  if (isMedicamento) {
    const modPart = modificador ? `|${modificador}` : '';
    chave = `${principio}|${dosagem}|${embalagem.unidadesChave}|${formaChave}${modPart}`;

    // Chave sem dosagem gerada apenas para associações (2+ princípios) em líquidos/tópicos com volume/peso explícito
    // (ex: "DEXCLORF. +BETAMETA 120 ML GLOBO XPE" sem dosagem na descrição casa com "0,4+0,05MG/ML XPE C/ 120 ML")
    const isAssociacao = principio.includes(' + ');
    if (isAssociacao && !dosagem && (embalagem.volumeTexto !== null)) {
      chaveSemDose = `${principio}||${embalagem.unidadesChave}|${formaChave}${modPart}`;
    } else if (isAssociacao && dosagem && (embalagem.volumeTexto !== null)) {
      chaveSemDose = `${principio}||${embalagem.unidadesChave}|${formaChave}${modPart}`;
    }
  }

  const nomeGrupoSugerido = `${principio}${dosagem ? ' ' + dosagem : ''} C/ ${embalagem.unidadesChave} ${forma}${modificador ? ' ' + modificador : ''}`
    .replace(/\s+/g, ' ')
    .trim();

  return {
    principio,
    dosagem,
    unidades: embalagem.unidades,
    unidadesChave: embalagem.unidadesChave,
    forma,
    formaChave,
    modificador,
    laboratorio,
    isMedicamento,
    origemPrincipio,
    chave,
    chaveSemDose,
    nomeGrupoSugerido
  };
}

/**
 * Sincroniza as substâncias oficiais (PROD_SUBSTANCIA + SUBSTANCIAS) e apresentações do Digifarma
 * para a tabela local compras_estoque_cache. Opera em query plana leve (~370ms) sem subqueries pesadas.
 */
async function sincronizarSubstanciasDigifarma(dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return { sincronizadas: 0, apresentacoesAtualizadas: 0, offline: true };

  let queryDigifarma = null;
  try {
    ({ queryDigifarma } = require('./digifarma.service'));
  } catch (e) {
    return { sincronizadas: 0, apresentacoesAtualizadas: 0, offline: true };
  }

  let sincronizadas = 0;
  let apresentacoesAtualizadas = 0;

  try {
    const rows = await queryDigifarma(`
      SELECT ps.PRODUTO_ID, ps.SUBSTANCIA_ID, TRIM(s.SUBSTANCIA) as SUBSTANCIA
      FROM PROD_SUBSTANCIA ps
      JOIN SUBSTANCIAS s ON s.SUBSTANCIA_ID = ps.SUBSTANCIA_ID
    `, [], 20000);

    if (Array.isArray(rows) && rows.length > 0) {
      const mapaProd = new Map();
      for (const r of rows) {
        const pid = Number(r.PRODUTO_ID);
        const subNome = String(r.SUBSTANCIA || '').trim();
        if (!pid || !subNome) continue;
        if (!mapaProd.has(pid)) {
          mapaProd.set(pid, { substanciaId: Number(r.SUBSTANCIA_ID), nomes: [subNome] });
        } else {
          const entry = mapaProd.get(pid);
          if (!entry.nomes.includes(subNome)) {
            entry.nomes.push(subNome);
          }
        }
      }

      const stmtUpdSub = db.prepare(`
        UPDATE compras_estoque_cache
        SET substancia_id = ?, substancia_nome = ?
        WHERE produto_id = ?
      `);

      db.transaction(() => {
        for (const [pid, info] of mapaProd.entries()) {
          const res = stmtUpdSub.run(info.substanciaId, info.nomes.join('; '), pid);
          if (res.changes > 0) sincronizadas++;
        }
      })();
    }
  } catch (errSub) {
    console.warn('[Equivalentes] Firebird offline/indisponível ao sincronizar substâncias:', errSub.message);
    return { sincronizadas: 0, apresentacoesAtualizadas: 0, offline: true, erro: errSub.message };
  }

  try {
    const rowsApres = await queryDigifarma(`
      SELECT p.PRODUTO_ID, TRIM(p.APRESENTACAO) as APRESENTACAO
      FROM PRODUTOS p
      WHERE p.PROD_ATIVO = 'S'
        AND p.APRESENTACAO IS NOT NULL
        AND TRIM(p.APRESENTACAO) <> ''
    `, [], 25000);

    if (Array.isArray(rowsApres) && rowsApres.length > 0) {
      const stmtUpdApres = db.prepare(`
        UPDATE compras_estoque_cache
        SET apresentacao = ?
        WHERE produto_id = ? AND (apresentacao IS NULL OR apresentacao = '')
      `);

      db.transaction(() => {
        for (const r of rowsApres) {
          const pid = Number(r.PRODUTO_ID);
          const apres = String(r.APRESENTACAO || '').trim();
          if (!pid || !apres) continue;
          const res = stmtUpdApres.run(apres, pid);
          if (res.changes > 0) apresentacoesAtualizadas++;
        }
      })();
    }
  } catch (errApres) {
    console.warn('[Equivalentes] Aviso ao sincronizar apresentações:', errApres.message);
  }

  return { sincronizadas, apresentacoesAtualizadas, offline: false };
}

/**
 * Regra A1 de Intercambialidade para cobertura de faltas:
 * - Genéricos (7) e Similares (2) (e medicamentos em Outros/0) se cobrem entre si e também são cobertos por Referência (1).
 * - Marca/Referência (1) NÃO é coberta por Genérico/Similar quando zera (apenas por outro cadastro da mesma Referência ou vínculo manual de Referência).
 */
function podeCobrirFalta(produtoAlvo, produtoEquivalente, isVinculoManual = false) {
  if (!produtoAlvo || !produtoEquivalente) return false;
  const catAlvo = Number(produtoAlvo.categoria_id || produtoAlvo.categoriaId || 0);
  const catEq = Number(produtoEquivalente.categoria_id || produtoEquivalente.categoriaId || 0);

  if (catEq === CATEGORIAS_DIGIFARMA.PERFUMARIA) return false;
  if (catAlvo === CATEGORIAS_DIGIFARMA.PERFUMARIA) return isVinculoManual;

  if (catAlvo === CATEGORIAS_DIGIFARMA.REFERENCIA) {
    // Referência só é coberta por outro cadastro de Referência (categoria 1) da mesma marca/apresentação
    if (catEq !== CATEGORIAS_DIGIFARMA.REFERENCIA) return false;
    if (isVinculoManual) return true;
    const p1 = normalizarTextoSimples(produtoAlvo.descricao || '').split(/\s+/)[0];
    const p2 = normalizarTextoSimples(produtoEquivalente.descricao || '').split(/\s+/)[0];
    return Boolean(p1 && p2 && p1.length >= 4 && p1 === p2);
  }

  return true;
}

/**
 * Resolve chave de equivalência para um produto considerando vínculos manuais e exclusões.
 */
function obterChaveEquivalenciaProduto(produto, mapas = {}) {
  const pid = Number(produto.produto_id || produto.produtoId || 0);
  const catId = Number(produto.categoria_id || produto.categoriaId || 0);

  if (mapas.vinculosManuaisMap && pid && mapas.vinculosManuaisMap.has(pid)) {
    return {
      chave: `MANUAL_${mapas.vinculosManuaisMap.get(pid)}`,
      chaveSemDose: null,
      attr: extrairAtributosProduto(produto.descricao, {
        apresentacao: produto.apresentacao,
        substanciaNome: produto.substancia_nome,
        categoriaId: catId,
        ean: produto.ean
      }),
      isReferencia: catId === CATEGORIAS_DIGIFARMA.REFERENCIA,
      isMedicamento: true,
      isManual: true
    };
  }

  const attr = extrairAtributosProduto(produto.descricao, {
    apresentacao: produto.apresentacao,
    substanciaNome: produto.substancia_nome,
    categoriaId: catId,
    ean: produto.ean
  });

  if (mapas.exclusoesSet && pid && attr.chave && mapas.exclusoesSet.has(`${pid}|${attr.chave}`)) {
    return {
      chave: null,
      chaveSemDose: null,
      attr,
      isReferencia: catId === CATEGORIAS_DIGIFARMA.REFERENCIA,
      isMedicamento: false,
      excluidoManualmente: true
    };
  }

  return {
    chave: attr.chave,
    chaveSemDose: attr.chaveSemDose,
    attr,
    isReferencia: catId === CATEGORIAS_DIGIFARMA.REFERENCIA,
    isMedicamento: attr.isMedicamento,
    isManual: false
  };
}

/**
 * Consulta o estoque consolidado e histórico de compras de um grupo de equivalentes.
 */
function obterEstoqueConsolidadoGrupo(grupoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db || !grupoId) return null;

  const grupo = db.prepare('SELECT * FROM compras_grupos_equivalentes WHERE id = ?').get(grupoId);
  if (!grupo) return null;

  const produtos = db.prepare(`
    SELECT 
      pe.id as vinculo_id,
      pe.produto_id,
      pe.ean,
      pe.descricao,
      pe.laboratorio,
      pe.manual_override,
      COALESCE(ec.categoria_id, 0) as categoria_id,
      COALESCE(ec.saldo, 0) as saldo,
      COALESCE(ec.est_minimo_calculado, ec.est_minimo_digifarma, 0) as est_minimo,
      COALESCE(ec.custo_unitario, 0) as custo_unitario,
      COALESCE(ec.ultima_compra_valor, 0) as ultima_compra_valor,
      COALESCE(ec.vmd_ponderado, 0) as vmd_ponderado
    FROM compras_produtos_equivalentes pe
    LEFT JOIN compras_estoque_cache ec ON pe.produto_id = ec.produto_id
    WHERE pe.grupo_id = ?
    ORDER BY ec.saldo DESC, pe.descricao ASC
  `).all(grupoId);

  let saldoTotal = 0;
  let saldoTotalReferencia = 0;
  let estMinimoTotal = 0;
  let vmdTotal = 0;
  const comprasValidas = [];

  for (const p of produtos) {
    const sPos = Math.max(0, Number(p.saldo || 0));
    saldoTotal += sPos;
    if (Number(p.categoria_id) === CATEGORIAS_DIGIFARMA.REFERENCIA) {
      saldoTotalReferencia += sPos;
    }
    vmdTotal += Number(p.vmd_ponderado || 0);
    estMinimoTotal = Math.max(estMinimoTotal, Number(p.est_minimo || 0));
    if (p.ultima_compra_valor && Number(p.ultima_compra_valor) > 0) {
      comprasValidas.push(Number(p.ultima_compra_valor));
    }
  }

  if (grupo.est_minimo_grupo && Number(grupo.est_minimo_grupo) > 0) {
    estMinimoTotal = Number(grupo.est_minimo_grupo);
  }

  vmdTotal = Number(vmdTotal.toFixed(4));
  let diasDuracaoEstoque = 0;
  if (saldoTotal <= 0) {
    diasDuracaoEstoque = 0;
  } else if (vmdTotal > 0) {
    diasDuracaoEstoque = Math.round(saldoTotal / vmdTotal);
  } else {
    diasDuracaoEstoque = 999;
  }

  let dataPrevisaoEsgotamento = null;
  if (diasDuracaoEstoque === 0) {
    dataPrevisaoEsgotamento = 'Ruptura (Hoje)';
  } else if (diasDuracaoEstoque >= 365) {
    dataPrevisaoEsgotamento = '+1 ano';
  } else {
    const d = new Date();
    d.setDate(d.getDate() + diasDuracaoEstoque);
    const pad = (n) => String(n).padStart(2, '0');
    dataPrevisaoEsgotamento = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  const menorUltimaCompra = comprasValidas.length > 0 ? Math.min(...comprasValidas) : 0;
  const mediaUltimaCompra = comprasValidas.length > 0
    ? Number((comprasValidas.reduce((a, b) => a + b, 0) / comprasValidas.length).toFixed(2))
    : 0;

  const emRuptura = saldoTotal <= 0 || (estMinimoTotal > 0 && saldoTotal < estMinimoTotal);

  return {
    grupoId: grupo.id,
    nomeGrupo: grupo.nome_grupo,
    principioAtivo: grupo.principio_ativo,
    dosagem: grupo.dosagem,
    unidadesEmbalagem: grupo.unidades_embalagem,
    formaFarmaceutica: grupo.forma_farmaceutica,
    chaveCanonica: grupo.chave_canonica || null,
    origem: grupo.origem || 'auto',
    saldoTotal,
    saldoTotalReferencia,
    estMinimoTotal,
    vmdTotal,
    diasDuracaoEstoque,
    dataPrevisaoEsgotamento,
    emRuptura,
    menorUltimaCompra,
    mediaUltimaCompra,
    quantidadeProdutos: produtos.length,
    produtos
  };
}

/**
 * Consulta o estoque consolidado em lote para uma lista de produtos.
 */
function obterConsolidadoParaProdutos(produtoIds = [], dbInstance) {
  const db = getDb(dbInstance);
  if (!db || !Array.isArray(produtoIds) || produtoIds.length === 0) return {};

  const placeholders = produtoIds.map(() => '?').join(',');
  const vinculos = db.prepare(`
    SELECT produto_id, grupo_id 
    FROM compras_produtos_equivalentes 
    WHERE produto_id IN (${placeholders})
  `).all(...produtoIds);

  if (vinculos.length === 0) return {};

  const gruposCarregados = new Map();
  const resultado = {};

  for (const v of vinculos) {
    let grupoData = gruposCarregados.get(v.grupo_id);
    if (!grupoData) {
      grupoData = obterEstoqueConsolidadoGrupo(v.grupo_id, db);
      if (grupoData) {
        gruposCarregados.set(v.grupo_id, grupoData);
      }
    }

    if (grupoData) {
      resultado[v.produto_id] = grupoData;
    }
  }

  return resultado;
}

/**
 * Busca se um produto pertence a algum grupo de equivalência existente.
 */
function buscarGrupoPorProduto(produtoId, ean, produtoNome, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return null;

  if (produtoId) {
    const vinculo = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE produto_id = ? LIMIT 1').get(produtoId);
    if (vinculo) {
      return obterEstoqueConsolidadoGrupo(vinculo.grupo_id, db);
    }
  }

  if (ean) {
    const vinculoEan = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE ean = ? LIMIT 1').get(ean);
    if (vinculoEan) {
      return obterEstoqueConsolidadoGrupo(vinculoEan.grupo_id, db);
    }
  }

  if (produtoNome) {
    const attr = extrairAtributosProduto(produtoNome);
    if (attr.chave) {
      const matchChave = db.prepare(`
        SELECT id FROM compras_grupos_equivalentes WHERE chave_canonica = ? LIMIT 1
      `).get(attr.chave);
      if (matchChave) {
        return obterEstoqueConsolidadoGrupo(matchChave.id, db);
      }
    }

    if (attr.principio && attr.principio !== 'OUTROS' && attr.unidades > 0) {
      const isMensal = (attr.unidades === 28 || attr.unidades === 30) && (attr.forma === 'COMPRIMIDO' || attr.forma === 'CÁPSULA' || attr.forma === 'COMP/CAPS');
      const matchGrupo = isMensal
        ? db.prepare(`
            SELECT id FROM compras_grupos_equivalentes 
            WHERE principio_ativo = ? 
              AND unidades_embalagem IN (28, 30)
              AND (dosagem = ? OR (dosagem IS NULL AND ? = ''))
            LIMIT 1
          `).get(attr.principio, attr.dosagem || '', attr.dosagem || '')
        : db.prepare(`
            SELECT id FROM compras_grupos_equivalentes 
            WHERE principio_ativo = ? 
              AND unidades_embalagem = ?
              AND (dosagem = ? OR (dosagem IS NULL AND ? = ''))
            LIMIT 1
          `).get(attr.principio, attr.unidades, attr.dosagem || '', attr.dosagem || '');

      if (matchGrupo) {
        return obterEstoqueConsolidadoGrupo(matchGrupo.id, db);
      }
    }
  }

  return null;
}

/**
 * Avalia se um produto zerado ou com saldo <= 1 está coberto pelo estoque de equivalentes elegíveis (Regra A1 + A2).
 */
function avaliarCoberturaEquivalente(produtoAlvo, opcoes = {}, dbInstance) {
  const db = getDb(dbInstance);
  const limiteMinimo = opcoes.limiteMinimoSaldoGrupo !== undefined ? Number(opcoes.limiteMinimoSaldoGrupo) : 1;
  const saldosReaisMap = opcoes.saldosReaisMap instanceof Map ? opcoes.saldosReaisMap : null;

  if (!db || !produtoAlvo) {
    return {
      coberto: false,
      saldoProprio: 0,
      saldoGrupo: 0,
      limiteMinimoSaldoGrupo: limiteMinimo,
      equivalentesComEstoque: [],
      todosMembrosGrupo: []
    };
  }

  const pidAlvo = Number(produtoAlvo.produto_id || produtoAlvo.produtoId || 0);
  let alvoEnriquecido = { ...produtoAlvo };

  if (pidAlvo && (!alvoEnriquecido.substancia_nome || !alvoEnriquecido.apresentacao || alvoEnriquecido.categoria_id === undefined)) {
    try {
      const cacheRow = db.prepare(`
        SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome, saldo
        FROM compras_estoque_cache WHERE produto_id = ?
      `).get(pidAlvo);
      if (cacheRow) {
        alvoEnriquecido = {
          ...cacheRow,
          ...alvoEnriquecido,
          apresentacao: alvoEnriquecido.apresentacao || cacheRow.apresentacao,
          substancia_nome: alvoEnriquecido.substancia_nome || cacheRow.substancia_nome,
          categoria_id: alvoEnriquecido.categoria_id !== undefined ? alvoEnriquecido.categoria_id : cacheRow.categoria_id
        };
      }
    } catch (e) {}
  }

  const getSaldoAtual = (prodId, fallbackSaldo) => {
    const p = Number(prodId);
    if (saldosReaisMap && p && saldosReaisMap.has(p)) {
      return Number(saldosReaisMap.get(p)) || 0;
    }
    return Number(fallbackSaldo) || 0;
  };

  const saldoProprio = getSaldoAtual(pidAlvo, alvoEnriquecido.saldo);
  const catAlvo = Number(alvoEnriquecido.categoria_id || alvoEnriquecido.categoriaId || 0);
  const isReferencia = catAlvo === CATEGORIAS_DIGIFARMA.REFERENCIA;

  // 1. Tenta localizar grupo persistido em compras_produtos_equivalentes
  let grupoEncontrado = null;
  let vinculoManualAlvo = false;
  if (pidAlvo) {
    const vinc = db.prepare(`
      SELECT pe.grupo_id, pe.manual_override
      FROM compras_produtos_equivalentes pe
      WHERE pe.produto_id = ?
      LIMIT 1
    `).get(pidAlvo);
    if (vinc) {
      vinculoManualAlvo = Boolean(vinc.manual_override);
      grupoEncontrado = obterEstoqueConsolidadoGrupo(vinc.grupo_id, db);
    }
  }

  const attrAlvo = extrairAtributosProduto(alvoEnriquecido.descricao || '', {
    apresentacao: alvoEnriquecido.apresentacao,
    substanciaNome: alvoEnriquecido.substancia_nome,
    categoriaId: catAlvo,
    ean: alvoEnriquecido.ean
  });

  if (!grupoEncontrado && attrAlvo.chave) {
    const gChave = db.prepare(`SELECT id FROM compras_grupos_equivalentes WHERE chave_canonica = ? LIMIT 1`).get(attrAlvo.chave);
    if (gChave) {
      grupoEncontrado = obterEstoqueConsolidadoGrupo(gChave.id, db);
    }
  }

  let membrosCandidatos = [];
  if (grupoEncontrado && Array.isArray(grupoEncontrado.produtos)) {
    membrosCandidatos = grupoEncontrado.produtos.map(p => ({
      produto_id: Number(p.produto_id),
      descricao: p.descricao,
      laboratorio: p.laboratorio,
      categoria_id: Number(p.categoria_id || 0),
      saldo: getSaldoAtual(p.produto_id, p.saldo),
      isVinculoManual: Boolean(p.manual_override && vinculoManualAlvo)
    }));
  } else if (attrAlvo.isMedicamento && attrAlvo.chave) {
    // Fallback dinâmico no cache quando produto ainda não entrou em um grupo persistido
    const prefixo = attrAlvo.principio.split(/[\s+]+/)[0];
    if (prefixo && prefixo.length >= 3) {
      const cands = db.prepare(`
        SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome, saldo
        FROM compras_estoque_cache
        WHERE saldo > 0
          AND categoria_id != 5
          AND (descricao LIKE ? OR substancia_nome LIKE ?)
      `).all(`%${prefixo.slice(0, 6)}%`, `%${prefixo.slice(0, 6)}%`);

      for (const c of cands) {
        const attrC = extrairAtributosProduto(c.descricao, {
          apresentacao: c.apresentacao,
          substanciaNome: c.substancia_nome,
          categoriaId: c.categoria_id,
          ean: c.ean
        });
        const matchChave = attrC.chave === attrAlvo.chave ||
          (attrAlvo.chaveSemDose && attrC.chaveSemDose && attrC.chaveSemDose === attrAlvo.chaveSemDose && (!attrAlvo.dosagem || !attrC.dosagem));
        if (matchChave) {
          membrosCandidatos.push({
            produto_id: Number(c.produto_id),
            descricao: c.descricao,
            laboratorio: attrC.laboratorio,
            categoria_id: Number(c.categoria_id || 0),
            saldo: getSaldoAtual(c.produto_id, c.saldo),
            isVinculoManual: false
          });
        }
      }
    }
  }

  // Garante que o próprio alvo esteja contabilizado se não apareceu na lista
  if (pidAlvo && !membrosCandidatos.some(m => m.produto_id === pidAlvo)) {
    membrosCandidatos.push({
      produto_id: pidAlvo,
      descricao: alvoEnriquecido.descricao || '',
      laboratorio: attrAlvo.laboratorio,
      categoria_id: catAlvo,
      saldo: saldoProprio,
      isVinculoManual: false
    });
  }

  // Aplica Regra A1 (quem pode cobrir quem) e soma apenas saldos positivos físicos
  let saldoGrupo = 0;
  const equivalentesComEstoque = [];
  const todosMembrosElegiveis = [];

  for (const m of membrosCandidatos) {
    const ehProprio = pidAlvo && m.produto_id === pidAlvo;
    const elegivel = ehProprio || podeCobrirFalta(alvoEnriquecido, m, m.isVinculoManual);
    if (!elegivel) continue;

    const saldoPos = Math.max(0, Number(m.saldo) || 0);
    saldoGrupo += saldoPos;
    todosMembrosElegiveis.push({ ...m, saldo: saldoPos });

    if (!ehProprio && saldoPos > 0) {
      equivalentesComEstoque.push({
        produtoId: m.produto_id,
        descricao: m.descricao,
        laboratorio: m.laboratorio || null,
        categoriaId: m.categoria_id,
        saldo: saldoPos
      });
    }
  }

  equivalentesComEstoque.sort((a, b) => b.saldo - a.saldo);

  // Coberto quando a soma física dos membros elegíveis supera o limiar (ex: > 1), E existe estoque em outro produto quando o próprio <= limiar
  const coberto = saldoGrupo > limiteMinimo && (equivalentesComEstoque.length > 0 || saldoProprio > limiteMinimo);

  let motivo = 'Sem cobertura equivalente em estoque';
  if (isReferencia && !coberto) {
    motivo = 'Produto de Referência (Marca) exige reposição específica';
  } else if (coberto && equivalentesComEstoque.length > 0) {
    const resumo = equivalentesComEstoque.slice(0, 2).map(e => `${e.descricao} (${e.saldo} un)`).join(', ');
    motivo = `Coberto por equivalente em estoque (${saldoGrupo} un no grupo): ${resumo}`;
  }

  return {
    coberto,
    saldoProprio,
    saldoGrupo,
    limiteMinimoSaldoGrupo: limiteMinimo,
    grupoId: grupoEncontrado ? grupoEncontrado.grupoId : null,
    grupoNome: grupoEncontrado ? grupoEncontrado.nomeGrupo : (attrAlvo.isMedicamento ? attrAlvo.nomeGrupoSugerido : null),
    chaveCanonica: attrAlvo.chave || null,
    isReferencia,
    motivo,
    equivalentesComEstoque,
    todosMembrosGrupo: todosMembrosElegiveis
  };
}

/**
 * Compara dois produtos ou testa um produto/texto contra todo o catálogo da loja (usado pelo Comparador/UI).
 */
function compararProdutosOuConsultar(entrada = {}, dbInstance) {
  const db = getDb(dbInstance);
  let produtoAlvo = null;

  if (entrada.produtoId && db) {
    produtoAlvo = db.prepare(`
      SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome, saldo
      FROM compras_estoque_cache WHERE produto_id = ?
    `).get(Number(entrada.produtoId));
  }

  if (!produtoAlvo && entrada.texto) {
    produtoAlvo = {
      produto_id: 0,
      descricao: String(entrada.texto).trim(),
      apresentacao: entrada.apresentacao || '',
      categoria_id: entrada.categoriaId !== undefined ? Number(entrada.categoriaId) : 7,
      substancia_nome: entrada.substanciaNome || '',
      saldo: 0
    };
  }

  const attrA = produtoAlvo
    ? extrairAtributosProduto(produtoAlvo.descricao, {
        apresentacao: produtoAlvo.apresentacao,
        substanciaNome: produtoAlvo.substancia_nome,
        categoriaId: produtoAlvo.categoria_id,
        ean: produtoAlvo.ean
      })
    : null;

  const cobertura = produtoAlvo
    ? avaliarCoberturaEquivalente(produtoAlvo, { limiteMinimoSaldoGrupo: 1 }, db)
    : null;

  let comparacaoB = null;
  if (entrada.produtoBTexto && attrA) {
    const attrB = extrairAtributosProduto(String(entrada.produtoBTexto).trim(), {
      categoriaId: entrada.categoriaBId !== undefined ? Number(entrada.categoriaBId) : 7
    });
    const chavesIguais = Boolean(
      attrA.isMedicamento &&
      attrB.isMedicamento &&
      ((attrA.chave && attrA.chave === attrB.chave) ||
        (attrA.chaveSemDose && attrB.chaveSemDose && attrA.chaveSemDose === attrB.chaveSemDose && (!attrA.dosagem || !attrB.dosagem)))
    );
    const podeCobrir = chavesIguais && podeCobrirFalta(
      { categoria_id: produtoAlvo.categoria_id, descricao: produtoAlvo.descricao },
      { categoria_id: entrada.categoriaBId !== undefined ? Number(entrada.categoriaBId) : 7, descricao: entrada.produtoBTexto }
    );
    comparacaoB = {
      atributos: attrB,
      equivalentesNaChave: chavesIguais,
      podeCobrirFalta: podeCobrir
    };
  }

  return {
    produto: produtoAlvo,
    atributos: attrA,
    cobertura,
    comparacaoB
  };
}

/**
 * Gera ou atualiza grupos automáticos a partir do catálogo em estoque cache.
 * - Limpa grupos automáticos antigos poluídos (preservando 100% dos grupos/vínculos manuais).
 * - Agrupa exclusivamente medicamentos válidos por princípio ativo + dosagem + embalagem + forma + modificador.
 */
function gerarGruposAutomaticos(dbInstance, opcoes = {}) {
  const db = getDb(dbInstance);
  if (!db) return { gruposCriados: 0, gruposRemovidos: 0, produtosVinculados: 0, medicamentosAnalisados: 0 };

  const limparAutomaticosAntigos = opcoes.limparAutomaticosAntigos !== false;
  let gruposRemovidos = 0;

  if (limparAutomaticosAntigos) {
    db.transaction(() => {
      db.prepare(`DELETE FROM compras_produtos_equivalentes WHERE COALESCE(manual_override, 0) = 0`).run();
      const resDel = db.prepare(`
        DELETE FROM compras_grupos_equivalentes
        WHERE COALESCE(origem, 'auto') != 'manual'
          AND COALESCE(est_minimo_grupo, 0) <= 0
          AND NOT EXISTS (
            SELECT 1 FROM compras_produtos_equivalentes pe WHERE pe.grupo_id = compras_grupos_equivalentes.id
          )
      `).run();
      gruposRemovidos = resDel.changes || 0;
    })();
  }

  // Carrega exclusões manuais
  const exclusoesSet = new Set();
  try {
    const exRows = db.prepare('SELECT produto_id, grupo_chave FROM compras_equivalentes_exclusoes').all();
    for (const ex of exRows) {
      if (ex.produto_id && ex.grupo_chave) {
        exclusoesSet.add(`${Number(ex.produto_id)}|${ex.grupo_chave}`);
      }
    }
  } catch (e) {}

  // Carrega produtos já vinculados manualmente para não duplicar
  const vinculadosManuaisSet = new Set();
  try {
    const manRows = db.prepare('SELECT produto_id FROM compras_produtos_equivalentes WHERE manual_override = 1').all();
    for (const m of manRows) vinculadosManuaisSet.add(Number(m.produto_id));
  } catch (e) {}

  const prods = db.prepare(`
    SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome,
           saldo, est_minimo_calculado, est_minimo_digifarma, ultima_compra_valor, custo_unitario
    FROM compras_estoque_cache
    WHERE descricao IS NOT NULL AND descricao != ''
      AND COALESCE(categoria_id, 0) != 5
  `).all();

  const gruposMap = new Map();
  const itensSemDoseAssociacao = [];
  let medicamentosAnalisados = 0;

  for (const p of prods) {
    if (vinculadosManuaisSet.has(Number(p.produto_id))) continue;

    const attr = extrairAtributosProduto(p.descricao, {
      apresentacao: p.apresentacao,
      substanciaNome: p.substancia_nome,
      categoriaId: p.categoria_id,
      ean: p.ean
    });

    if (!attr.isMedicamento || !attr.chave) continue;
    if (exclusoesSet.has(`${Number(p.produto_id)}|${attr.chave}`)) continue;

    medicamentosAnalisados++;

    if (!attr.dosagem && attr.chaveSemDose) {
      itensSemDoseAssociacao.push({ p, attr });
      continue;
    }

    if (!gruposMap.has(attr.chave)) {
      gruposMap.set(attr.chave, {
        chaveCanonica: attr.chave,
        chaveSemDose: attr.chaveSemDose,
        nomeGrupo: attr.nomeGrupoSugerido,
        principio: attr.principio,
        dosagem: attr.dosagem,
        unidades: attr.unidadesChave === '28-30' ? 30 : (parseInt(attr.unidadesChave, 10) || attr.unidades || 1),
        isMensal: attr.unidadesChave === '28-30',
        forma: attr.forma,
        produtos: []
      });
    }

    gruposMap.get(attr.chave).produtos.push({
      ...p,
      laboratorio: attr.laboratorio
    });
  }

  // Reconcilia itens de associação sem dosagem na descrição (ex: "DEXCLORF. +BETAMETA 120 ML GLOBO XPE")
  // quando existir EXATAMENTE 1 grupo com dosagem definida para aquela mesma associação + embalagem + forma
  if (itensSemDoseAssociacao.length > 0) {
    const indiceSemDose = new Map();
    for (const gData of gruposMap.values()) {
      if (gData.chaveSemDose) {
        if (!indiceSemDose.has(gData.chaveSemDose)) indiceSemDose.set(gData.chaveSemDose, []);
        indiceSemDose.get(gData.chaveSemDose).push(gData);
      }
    }
    for (const { p, attr } of itensSemDoseAssociacao) {
      const candidatos = indiceSemDose.get(attr.chaveSemDose);
      if (candidatos && candidatos.length === 1) {
        candidatos[0].produtos.push({ ...p, laboratorio: attr.laboratorio });
      }
    }
  }

  let gruposCriados = 0;
  let produtosVinculados = 0;
  const nowIso = new Date().toISOString();

  const stmtFindByChave = db.prepare(`SELECT id FROM compras_grupos_equivalentes WHERE chave_canonica = ? LIMIT 1`);
  const stmtFindMensal = db.prepare(`
    SELECT id FROM compras_grupos_equivalentes 
    WHERE principio_ativo = ? AND (dosagem = ? OR (dosagem IS NULL AND ? = '')) AND unidades_embalagem IN (28, 30)
      AND forma_farmaceutica = ?
    LIMIT 1
  `);
  const stmtFindExato = db.prepare(`
    SELECT id FROM compras_grupos_equivalentes 
    WHERE principio_ativo = ? AND (dosagem = ? OR (dosagem IS NULL AND ? = '')) AND unidades_embalagem = ?
      AND forma_farmaceutica = ?
    LIMIT 1
  `);
  const stmtInsertGrupo = db.prepare(`
    INSERT INTO compras_grupos_equivalentes (
      id, nome_grupo, principio_ativo, dosagem, unidades_embalagem, forma_farmaceutica,
      chave_canonica, origem, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'auto', ?, ?)
  `);
  const stmtUpdGrupoChave = db.prepare(`
    UPDATE compras_grupos_equivalentes SET chave_canonica = ?, updated_at = ? WHERE id = ?
  `);
  const stmtExisteVinc = db.prepare(`SELECT id FROM compras_produtos_equivalentes WHERE produto_id = ? LIMIT 1`);
  const stmtInsertVinc = db.prepare(`
    INSERT INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `);

  db.transaction(() => {
    for (const [, gData] of gruposMap.entries()) {
      if (gData.produtos.length < 2) continue;

      let grupo = stmtFindByChave.get(gData.chaveCanonica);
      if (!grupo) {
        grupo = gData.isMensal
          ? stmtFindMensal.get(gData.principio, gData.dosagem || '', gData.dosagem || '', gData.forma)
          : stmtFindExato.get(gData.principio, gData.dosagem || '', gData.dosagem || '', gData.unidades, gData.forma);
      }

      let grupoId = grupo ? grupo.id : null;

      if (!grupoId) {
        grupoId = crypto.randomUUID();
        stmtInsertGrupo.run(
          grupoId,
          gData.nomeGrupo,
          gData.principio,
          gData.dosagem,
          gData.unidades,
          gData.forma,
          gData.chaveCanonica,
          nowIso,
          nowIso
        );
        gruposCriados++;
      } else {
        stmtUpdGrupoChave.run(gData.chaveCanonica, nowIso, grupoId);
      }

      for (const prod of gData.produtos) {
        if (!stmtExisteVinc.get(prod.produto_id)) {
          stmtInsertVinc.run(
            crypto.randomUUID(),
            grupoId,
            prod.produto_id,
            prod.ean || null,
            prod.descricao,
            prod.laboratorio || null,
            nowIso
          );
          produtosVinculados++;
        }
      }
    }
  })();

  return { gruposCriados, gruposRemovidos, produtosVinculados, medicamentosAnalisados };
}

/**
 * Reavalia faltas pendentes (`purchased = 0 AND ordered = 0`) à luz dos equivalentes em estoque.
 * - Faltas automáticas (`source = 'auto'`) cobertas (`saldoGrupo > 1`) recebem baixa automática (`purchased = 1`) se dryRun = false.
 * - Faltas manuais/WhatsApp recebem apenas marcação `coberto_por_equivalente = 1` + `equivalente_info` para alerta visual.
 */
async function reavaliarFaltasComEquivalentes(dbInstance, opcoes = {}) {
  const db = getDb(dbInstance);
  if (!db) return { totalAnalisadas: 0, totalCobertasAuto: 0, totalCobertasManuais: 0, baixadas: 0, amostraCobertas: [] };

  const dryRun = Boolean(opcoes.dryRun);
  const consultarFirebird = opcoes.consultarFirebird !== false;

  const faltasPendentes = db.prepare(`
    SELECT id, productName, type, clientInquiry, notes, source, saldo, purchased, ordered
    FROM shortages
    WHERE COALESCE(purchased, 0) = 0 AND COALESCE(ordered, 0) = 0
  `).all();

  if (faltasPendentes.length === 0) {
    return { totalAnalisadas: 0, totalCobertasAuto: 0, totalCobertasManuais: 0, baixadas: 0, amostraCobertas: [] };
  }

  // Resolve cada falta para registro em compras_estoque_cache
  const stmtMatchExato = db.prepare(`
    SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome, saldo
    FROM compras_estoque_cache
    WHERE UPPER(TRIM(descricao)) = ?
    LIMIT 1
  `);
  const stmtMatchPrefix = db.prepare(`
    SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome, saldo
    FROM compras_estoque_cache
    WHERE UPPER(descricao) LIKE ?
    ORDER BY saldo ASC
    LIMIT 1
  `);

  const itensResolvidos = [];
  const idsParaConsultarFirebird = new Set();

  for (const falta of faltasPendentes) {
    const nomeUp = String(falta.productName || '').trim().toUpperCase();
    if (!nomeUp) continue;

    let prodCache = stmtMatchExato.get(nomeUp) || stmtMatchPrefix.get(`${nomeUp}%`);
    if (!prodCache) {
      // Fallback sintético se não encontrado diretamente pelo nome
      const catGuess = falta.type === 'Genérico' ? 7 : (falta.type === 'Similar' ? 2 : (falta.type === 'Marca (Referência)' ? 1 : (falta.type === 'Perfumaria' ? 5 : 0)));
      prodCache = {
        produto_id: 0,
        descricao: nomeUp,
        apresentacao: '',
        ean: null,
        categoria_id: catGuess,
        substancia_nome: null,
        saldo: Number(falta.saldo) || 0
      };
    }

    if (prodCache.produto_id) {
      idsParaConsultarFirebird.add(Number(prodCache.produto_id));
      // Pré-coleta IDs de membros do mesmo grupo para consultar saldo real no Firebird
      const vinc = db.prepare('SELECT grupo_id FROM compras_produtos_equivalentes WHERE produto_id = ? LIMIT 1').get(prodCache.produto_id);
      if (vinc) {
        const membros = db.prepare('SELECT produto_id FROM compras_produtos_equivalentes WHERE grupo_id = ?').all(vinc.grupo_id);
        for (const m of membros) idsParaConsultarFirebird.add(Number(m.produto_id));
      }
    }

    itensResolvidos.push({ falta, prodCache });
  }

  // Busca saldos atualizados direto do Firebird em lotes de 100 IDs literais (sem subquery pesada)
  const saldosReaisMap = new Map();
  if (consultarFirebird && idsParaConsultarFirebird.size > 0) {
    try {
      const { queryDigifarma } = require('./digifarma.service');
      const allIds = [...idsParaConsultarFirebird].filter(id => id > 0);
      for (let i = 0; i < allIds.length; i += 100) {
        const lote = allIds.slice(i, i + 100);
        const placeholders = lote.map(() => '?').join(',');
        const rowsFb = await queryDigifarma(
          `SELECT PRODUTO_ID, PROD_SALDO FROM PRODUTOS WHERE PRODUTO_ID IN (${placeholders})`,
          lote,
          10000
        );
        for (const r of (rowsFb || [])) {
          saldosReaisMap.set(Number(r.PRODUTO_ID), Number(r.PROD_SALDO) || 0);
        }
      }
    } catch (eFb) {
      console.warn('[Equivalentes] Firebird offline na reavaliação de faltas — usando saldos do cache local:', eFb.message);
    }
  }

  let totalCobertasAuto = 0;
  let totalCobertasManuais = 0;
  let baixadas = 0;
  const amostraCobertas = [];

  const stmtBaixarAuto = db.prepare(`
    UPDATE shortages
    SET purchased = 1,
        coberto_por_equivalente = 1,
        equivalente_info = ?,
        notes = ?
    WHERE id = ?
  `);
  const stmtMarcarManual = db.prepare(`
    UPDATE shortages
    SET coberto_por_equivalente = 1,
        equivalente_info = ?
    WHERE id = ?
  `);
  const stmtDesmarcar = db.prepare(`
    UPDATE shortages
    SET coberto_por_equivalente = 0,
        equivalente_info = NULL
    WHERE id = ?
  `);

  const operacoes = [];

  for (const { falta, prodCache } of itensResolvidos) {
    const aval = avaliarCoberturaEquivalente(prodCache, {
      limiteMinimoSaldoGrupo: 1,
      saldosReaisMap: saldosReaisMap.size > 0 ? saldosReaisMap : null
    }, db);

    if (aval.coberto && aval.equivalentesComEstoque.length > 0) {
      const infoCompacta = JSON.stringify({
        coberto: true,
        grupoNome: aval.grupoNome,
        saldoGrupo: aval.saldoGrupo,
        equivalentesComEstoque: aval.equivalentesComEstoque.slice(0, 5)
      });

      const isAuto = falta.source === 'auto';
      if (isAuto) totalCobertasAuto++;
      else totalCobertasManuais++;

      const labsResumo = aval.equivalentesComEstoque
        .slice(0, 3)
        .map(e => `${e.descricao} (${e.saldo} un)`)
        .join(' | ');

      amostraCobertas.push({
        id: falta.id,
        productName: falta.productName,
        source: falta.source || 'manual',
        saldoProprio: aval.saldoProprio,
        saldoGrupo: aval.saldoGrupo,
        grupoNome: aval.grupoNome,
        equivalentes: aval.equivalentesComEstoque.slice(0, 3)
      });

      operacoes.push({
        id: falta.id,
        isAuto,
        coberto: true,
        infoCompacta,
        novaNota: `${falta.notes ? falta.notes + ' ' : ''}[Coberto por equivalente: ${labsResumo}]`.trim()
      });
    } else {
      operacoes.push({ id: falta.id, coberto: false });
    }
  }

  if (!dryRun) {
    db.transaction(() => {
      for (const op of operacoes) {
        if (op.coberto) {
          if (op.isAuto) {
            const res = stmtBaixarAuto.run(op.infoCompacta, op.novaNota, op.id);
            if (res.changes > 0) baixadas++;
          } else {
            stmtMarcarManual.run(op.infoCompacta, op.id);
          }
        } else {
          stmtDesmarcar.run(op.id);
        }
      }
    })();
  }

  return {
    totalAnalisadas: itensResolvidos.length,
    totalCobertasAuto,
    totalCobertasManuais,
    baixadas,
    dryRun,
    firebirdConsultado: saldosReaisMap.size > 0,
    amostraCobertas
  };
}

/**
 * Listagem paginada de grupos equivalentes com saldos consolidados e busca.
 */
function listarGruposEquivalentes(filtros = {}, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) return { total: 0, grupos: [] };

  let sql = `SELECT id FROM compras_grupos_equivalentes WHERE 1=1`;
  const params = [];

  if (filtros.busca) {
    sql += ` AND (nome_grupo LIKE ? OR principio_ativo LIKE ?)`;
    const b = `%${filtros.busca}%`;
    params.push(b, b);
  }

  sql += ` ORDER BY nome_grupo ASC`;

  const rows = db.prepare(sql).all(...params);
  let grupos = rows.map(r => obterEstoqueConsolidadoGrupo(r.id, db)).filter(Boolean);

  if (filtros.apenasRuptura) {
    grupos = grupos.filter(g => g.emRuptura);
  }

  const total = grupos.length;
  const pagina = parseInt(filtros.pagina, 10) || 1;
  const limite = parseInt(filtros.limite, 10) || 20;
  const offset = (pagina - 1) * limite;
  const paginados = grupos.slice(offset, offset + limite);

  return {
    total,
    pagina,
    limite,
    totalPaginas: Math.ceil(total / limite),
    grupos: paginados
  };
}

/**
 * Cria ou atualiza um grupo manualmente.
 */
function salvarGrupoManual(dados, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  const nowIso = new Date().toISOString();
  const id = dados.id || crypto.randomUUID();

  if (dados.id) {
    db.prepare(`
      UPDATE compras_grupos_equivalentes 
      SET nome_grupo = ?, principio_ativo = ?, dosagem = ?, unidades_embalagem = ?,
          forma_farmaceutica = ?, est_minimo_grupo = ?, observacoes = ?, origem = 'manual', updated_at = ?
      WHERE id = ?
    `).run(
      dados.nomeGrupo,
      dados.principioAtivo,
      dados.dosagem || '',
      parseInt(dados.unidadesEmbalagem, 10) || 1,
      dados.formaFarmaceutica || 'COMP/CAPS',
      parseFloat(dados.estMinimoGrupo) || 0,
      dados.observacoes || null,
      nowIso,
      id
    );
  } else {
    db.prepare(`
      INSERT INTO compras_grupos_equivalentes (
        id, nome_grupo, principio_ativo, dosagem, unidades_embalagem,
        forma_farmaceutica, est_minimo_grupo, observacoes, origem, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)
    `).run(
      id,
      dados.nomeGrupo,
      dados.principioAtivo,
      dados.dosagem || '',
      parseInt(dados.unidadesEmbalagem, 10) || 1,
      dados.formaFarmaceutica || 'COMP/CAPS',
      parseFloat(dados.estMinimoGrupo) || 0,
      dados.observacoes || null,
      nowIso,
      nowIso
    );
  }

  return obterEstoqueConsolidadoGrupo(id, db);
}

/**
 * Vincula um produto existente do estoque ao grupo de equivalentes.
 */
function vincularProdutoAoGrupo(grupoId, produtoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  const grupo = db.prepare('SELECT id, chave_canonica FROM compras_grupos_equivalentes WHERE id = ?').get(grupoId);
  if (!grupo) throw new Error('Grupo não encontrado');

  const prodEstoque = db.prepare(`
    SELECT produto_id, descricao, apresentacao, ean, categoria_id, substancia_nome
    FROM compras_estoque_cache WHERE produto_id = ?
  `).get(produtoId) || db.prepare(`
    SELECT produto_id, descricao, codigo_barras as ean, categoria_id FROM digifarma_products_cache WHERE produto_id = ?
  `).get(produtoId);

  if (!prodEstoque) throw new Error('Produto não encontrado no cadastro do Digifarma');

  const attr = extrairAtributosProduto(prodEstoque.descricao, {
    apresentacao: prodEstoque.apresentacao,
    substanciaNome: prodEstoque.substancia_nome,
    categoriaId: prodEstoque.categoria_id,
    ean: prodEstoque.ean
  });
  const nowIso = new Date().toISOString();

  // Remove possível exclusão anterior caso o usuário decida vincular novamente
  if (grupo.chave_canonica) {
    try {
      db.prepare('DELETE FROM compras_equivalentes_exclusoes WHERE produto_id = ? AND grupo_chave = ?')
        .run(Number(produtoId), grupo.chave_canonica);
    } catch (e) {}
  }

  db.prepare(`
    INSERT INTO compras_produtos_equivalentes (
      id, grupo_id, produto_id, ean, descricao, laboratorio, manual_override, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT(grupo_id, produto_id) DO UPDATE SET
      ean = excluded.ean,
      descricao = excluded.descricao,
      laboratorio = excluded.laboratorio,
      manual_override = 1
  `).run(
    crypto.randomUUID(),
    grupoId,
    produtoId,
    prodEstoque.ean || null,
    prodEstoque.descricao,
    attr.laboratorio,
    nowIso
  );

  try {
    db.prepare(`UPDATE compras_grupos_equivalentes SET origem = 'manual', updated_at = ? WHERE id = ?`).run(nowIso, grupoId);
  } catch (e) {}

  return obterEstoqueConsolidadoGrupo(grupoId, db);
}

/**
 * Desvincula um produto de um grupo de equivalência e registra exclusão para o auto-agrupamento não re-vincular.
 */
function desvincularProdutoDoGrupo(grupoId, produtoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  const grupo = db.prepare('SELECT id, chave_canonica FROM compras_grupos_equivalentes WHERE id = ?').get(grupoId);

  db.prepare(`
    DELETE FROM compras_produtos_equivalentes WHERE grupo_id = ? AND produto_id = ?
  `).run(grupoId, produtoId);

  if (grupo && grupo.chave_canonica) {
    try {
      db.prepare(`
        INSERT OR IGNORE INTO compras_equivalentes_exclusoes (id, produto_id, grupo_chave, grupo_id, motivo, created_at)
        VALUES (?, ?, ?, ?, 'desvinculado_manual', ?)
      `).run(crypto.randomUUID(), Number(produtoId), grupo.chave_canonica, grupoId, new Date().toISOString());
    } catch (e) {}
  }

  return obterEstoqueConsolidadoGrupo(grupoId, db);
}

/**
 * Verifica se um produto candidato (ex: entrada de NF) é equivalente e elegível para cobrir/baixar uma falta.
 */
function saoProdutosEquivalentesParaFalta(produtoAlvo, produtoCandidato, dbInstance) {
  if (!produtoAlvo || !produtoCandidato) return false;
  const db = getDb(dbInstance);

  const pidA = Number(produtoAlvo.produto_id || produtoAlvo.produtoId || 0);
  const pidB = Number(produtoCandidato.produto_id || produtoCandidato.produtoId || 0);
  if (pidA && pidB && pidA === pidB) return true;

  let manualMesmoGrupo = false;
  if (db && pidA && pidB) {
    try {
      const row = db.prepare(`
        SELECT a.grupo_id, (a.manual_override AND b.manual_override) as ambos_manuais
        FROM compras_produtos_equivalentes a
        JOIN compras_produtos_equivalentes b ON a.grupo_id = b.grupo_id
        WHERE a.produto_id = ? AND b.produto_id = ?
        LIMIT 1
      `).get(pidA, pidB);
      if (row) {
        manualMesmoGrupo = Boolean(row.ambos_manuais);
        return podeCobrirFalta(produtoAlvo, produtoCandidato, manualMesmoGrupo);
      }
    } catch (e) {}
  }

  const attrA = extrairAtributosProduto(produtoAlvo.descricao || '', {
    apresentacao: produtoAlvo.apresentacao,
    substanciaNome: produtoAlvo.substancia_nome,
    categoriaId: produtoAlvo.categoria_id,
    ean: produtoAlvo.ean
  });
  const attrB = extrairAtributosProduto(produtoCandidato.descricao || '', {
    apresentacao: produtoCandidato.apresentacao,
    substanciaNome: produtoCandidato.substancia_nome,
    categoriaId: produtoCandidato.categoria_id,
    ean: produtoCandidato.ean
  });

  if (!attrA.isMedicamento || !attrB.isMedicamento) return false;

  const chavesIguais = Boolean(
    (attrA.chave && attrB.chave && attrA.chave === attrB.chave) ||
    (attrA.chaveSemDose && attrB.chaveSemDose && attrA.chaveSemDose === attrB.chaveSemDose && (!attrA.dosagem || !attrB.dosagem))
  );
  if (!chavesIguais) return false;

  return podeCobrirFalta(produtoAlvo, produtoCandidato, false);
}

/**
 * Exclui um grupo de equivalência por completo.
 */
function removerGrupoEquivalente(grupoId, dbInstance) {
  const db = getDb(dbInstance);
  if (!db) throw new Error('Banco de dados indisponível');

  db.prepare('DELETE FROM compras_grupos_equivalentes WHERE id = ?').run(grupoId);
  return { success: true };
}

module.exports = {
  CATEGORIAS_DIGIFARMA,
  extrairAtributosProduto,
  obterChaveEquivalenciaProduto,
  podeCobrirFalta,
  saoProdutosEquivalentesParaFalta,
  avaliarCoberturaEquivalente,
  compararProdutosOuConsultar,
  sincronizarSubstanciasDigifarma,
  reavaliarFaltasComEquivalentes,
  obterEstoqueConsolidadoGrupo,
  buscarGrupoPorProduto,
  gerarGruposAutomaticos,
  listarGruposEquivalentes,
  salvarGrupoManual,
  vincularProdutoAoGrupo,
  desvincularProdutoDoGrupo,
  removerGrupoEquivalente,
  obterConsolidadoParaProdutos
};
