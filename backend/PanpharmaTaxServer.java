import java.io.*;
import java.net.*;
import java.math.BigDecimal;
import java.util.*;
import com.sun.net.httpserver.*;
import com.taxweb.domains.*;
import br.com.gruposc.taxrules.util.TaxRulesUtil;
import com.mcfox.tax.management.TaxRulesAPI;

public class PanpharmaTaxServer {
    private static final int PORT = 3009;
    private static TaxRulesAPI api;
    private static Pessoa emitente;
    private static Pessoa destinatario;

    public static void main(String[] args) {
        try {
            System.out.println("[TaxServer] Initializing TaxRulesAPI engine...");
            api = new TaxRulesAPI();

            // CD MG12 (PP01 - MG - Varginha - Venda)
            emitente = new Pessoa();
            emitente.setCdAtividadeEconomica(new String[]{"4644301"});
            emitente.setCdPais("105");
            emitente.setCdMunicipio("3170701");
            emitente.setCnpj("01206820003546");
            emitente.setContribuinteCOFINS("S");
            emitente.setContribuinteICMS("S");
            emitente.setContribuinteII("N");
            emitente.setContribuinteIPI("N");
            emitente.setContribuinteISS("N");
            emitente.setContribuintePIS("S");
            emitente.setContribuinteST("N");
            emitente.setSimplesNac("N");
            emitente.setUf("MG");

            // Cliente 528854 (BELA FARMA SUL LTDA - MG)
            destinatario = new Pessoa();
            destinatario.setCdAtividadeEconomica(new String[]{"4771701"});
            destinatario.setCdPais("105");
            destinatario.setCdMunicipio("3136702");
            destinatario.setCnpj("47378578000140");
            destinatario.setContribuinteCOFINS("N");
            destinatario.setContribuinteICMS("S");
            destinatario.setContribuinteII("N");
            destinatario.setContribuinteIPI("N");
            destinatario.setContribuinteISS("N");
            destinatario.setContribuintePIS("N");
            destinatario.setContribuinteST("N");
            destinatario.setSimplesNac("N");
            destinatario.setUf("MG");

            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", PORT), 0);
            server.createContext("/ping", new PingHandler());
            server.createContext("/calc-preco-nf", new CalcHandler());
            server.setExecutor(null); // default executor
            server.start();
            System.out.println("[TaxServer] Tax server running on http://127.0.0.1:" + PORT);
        } catch (Exception e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    static class PingHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            byte[] resp = "{\"status\":\"OK\",\"message\":\"Panpharma Tax Server Ready\"}".getBytes("UTF-8");
            ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            ex.sendResponseHeaders(200, resp.length);
            OutputStream os = ex.getResponseBody();
            os.write(resp);
            os.close();
        }
    }

    static class CalcHandler implements HttpHandler {
        public void handle(HttpExchange ex) throws IOException {
            if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
                ex.sendResponseHeaders(405, -1);
                return;
            }

            InputStreamReader isr = new InputStreamReader(ex.getRequestBody(), "UTF-8");
            BufferedReader br = new BufferedReader(isr);
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            br.close();

            String jsonInput = sb.toString();
            String jsonOutput = processCalculation(jsonInput);

            byte[] resp = jsonOutput.getBytes("UTF-8");
            ex.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
            ex.sendResponseHeaders(200, resp.length);
            OutputStream os = ex.getResponseBody();
            os.write(resp);
            os.close();
        }
    }

    private static String processCalculation(String jsonInput) {
        try {
            DocFiscal docFiscal = TaxRulesUtil.builderDocFiscal(emitente, destinatario, "N");

            // Simple parser for input array of objects
            List<Map<String, String>> inputList = parseJsonArray(jsonInput);
            if (inputList.isEmpty()) {
                return "[]";
            }

            List<ItemDocFiscal> itens = new ArrayList<ItemDocFiscal>();
            for (Map<String, String> m : inputList) {
                String cod = m.getOrDefault("codigo", "0");
                String ean = m.getOrDefault("ean", "");
                String desc = m.getOrDefault("descricao", "Produto " + cod);
                BigDecimal pf = new BigDecimal(m.getOrDefault("precoFabrica", "0"));
                BigDecimal vDesc = new BigDecimal(m.getOrDefault("valorDesconto", "0"));
                BigDecimal pmc = new BigDecimal(m.getOrDefault("pmc", pf.toString()));
                String ncm = m.getOrDefault("ncm", "30049099");
                String cest = m.getOrDefault("cest", "1300301");

                ItemDocFiscal item = new ItemDocFiscal();
                item.setCdClassificacao("M");
                item.setDeduzCEST("N");
                item.setDeduzCFOP("S");
                item.setDeduzCSTCOFINS("S");
                item.setDeduzCSTICMS("S");
                item.setDeduzCSTIPI("N");
                item.setDeduzCSTPIS("S");
                item.setIndFarmaciaPopular("N");
                item.setQtItemDocFiscal(BigDecimal.ONE);
                item.setQtTributaria(BigDecimal.ONE);
                item.setQtTributariaUnidade("UN");
                item.setUnidade("UN");
                item.setVlDesconto(vDesc);
                item.setVlPMC(pmc);
                item.setVlPrecoFabrica(pf);
                item.setVlTotal(pf);
                item.setVlTotalCI(pf);

                com.taxweb.domains.Produto prod = new com.taxweb.domains.Produto();
                prod.setCodigo(cod);
                prod.setEAN(ean);
                prod.setDescricao(desc);
                prod.setNCM(ncm);
                prod.setCEST(cest);
                prod.setCdOrigem("0");
                prod.setFabricacao("1");
                prod.setAplicacao("C");
                item.setProdItem(prod);

                itens.add(item);
            }

            ItemDocFiscal[] arrItens = itens.toArray(new ItemDocFiscal[0]);
            TaxRulesUtil.populaCdItemDocFiscal(arrItens);
            docFiscal.setItensDocFiscal(arrItens);

            DocFiscal res = api.calcTaxes(new DocFiscal[]{docFiscal})[0];

            StringBuilder out = new StringBuilder();
            out.append("[");
            boolean first = true;
            for (ItemDocFiscal it : res.getItensDocFiscal()) {
                if (!first) out.append(",");
                first = false;

                String cod = it.getProdItem().getCodigo();
                String ean = it.getProdItem().getEAN();
                BigDecimal pf = it.getVlPrecoFabrica();
                BigDecimal desc = it.getVlDesconto();
                BigDecimal precoLiq = pf.subtract(desc);
                BigDecimal st = TaxRulesUtil.obterValorDoImpostoST(it, BigDecimal.ZERO);
                BigDecimal precoFinal = TaxRulesUtil.obterPrecoFinal(pf, desc, it);

                out.append("{");
                out.append("\"codigo\":\"").append(cod).append("\",");
                out.append("\"ean\":\"").append(ean).append("\",");
                out.append("\"precoFabrica\":").append(pf).append(",");
                out.append("\"valorDesconto\":").append(desc).append(",");
                out.append("\"precoLiquido\":").append(precoLiq).append(",");
                out.append("\"valorST\":").append(st).append(",");
                out.append("\"precoNF\":").append(precoFinal);
                out.append("}");
            }
            out.append("]");
            return out.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    private static List<Map<String, String>> parseJsonArray(String json) {
        List<Map<String, String>> list = new ArrayList<Map<String, String>>();
        if (json == null) return list;
        json = json.trim();
        if (json.startsWith("[")) json = json.substring(1);
        if (json.endsWith("]")) json = json.substring(0, json.length() - 1);

        String[] objects = json.split("\\},\\s*\\{");
        for (String obj : objects) {
            obj = obj.replace("{", "").replace("}", "").trim();
            if (obj.isEmpty()) continue;
            Map<String, String> map = new HashMap<String, String>();
            String[] pairs = obj.split(",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)");
            for (String pair : pairs) {
                String[] kv = pair.split(":(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", 2);
                if (kv.length == 2) {
                    String k = kv[0].trim().replace("\"", "");
                    String v = kv[1].trim().replace("\"", "");
                    map.put(k, v);
                }
            }
            if (!map.isEmpty()) list.add(map);
        }
        return list;
    }
}
