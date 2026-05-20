import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface ImportDataProps {
  onDataImported: (data: any[]) => void;
}

export function ImportData({ onDataImported }: ImportDataProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<{
    status: "idle" | "success" | "error";
    message: string;
    rowsImported?: number;
  }>({ status: "idle", message: "" });

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setImportStatus({ status: "idle", message: "" });

    try {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;

          if (!data) throw new Error("Erro ao ler arquivo");

          // Detectar tipo de arquivo
          let rows: any[] = [];

          if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
            // Ler Excel
            const workbook = XLSX.read(data, { type: "binary" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            rows = XLSX.utils.sheet_to_json(worksheet);
          } else if (file.name.endsWith(".csv")) {
            // Ler CSV
            const text = new TextDecoder().decode(data as ArrayBuffer);
            const lines = text.trim().split("\n");
            const headers = lines[0].split(",").map((h) => h.trim());

            rows = lines.slice(1).map((line) => {
              const values = line.split(",").map((v) => v.trim());
              const obj: any = {};
              headers.forEach((header, idx) => {
                obj[header] = values[idx] || "";
              });
              return obj;
            });
          } else {
            throw new Error("Formato de arquivo não suportado. Use .xlsx ou .csv");
          }

          if (rows.length === 0) {
            throw new Error("Arquivo vazio ou sem dados válidos");
          }

          // Validar se tem as colunas esperadas (com tolerância para variações)
          const requiredColumns = ["Data da Despesa", "Valor lançamento"];
          const columnNames = Object.keys(rows[0]);
          
          // Função para normalizar strings (remove acentos e converte para minúsculas)
          const normalizeString = (str: string) => {
            return str
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, " ");
          };
          
          const normalizedColumnNames = columnNames.map(normalizeString);
          
          const hasRequiredColumns = requiredColumns.every((col) => {
            const normalizedRequired = normalizeString(col);
            return normalizedColumnNames.includes(normalizedRequired);
          });

          if (!hasRequiredColumns) {
            console.error("Colunas encontradas:", columnNames);
            console.error("Colunas esperadas:", requiredColumns);
            throw new Error(
              `Arquivo deve conter as colunas: ${requiredColumns.join(", ")}. Colunas encontradas: ${columnNames.join(", ")}`
            );
          }

          // Processar dados
          const processedData = rows.map((row) => ({
            ...row,
            "Valor lançamento": parseFloat(String(row["Valor lançamento"]).replace(",", ".")) || 0,
          }));

          onDataImported(processedData);

          setImportStatus({
            status: "success",
            message: `✓ ${processedData.length} registros importados com sucesso!`,
            rowsImported: processedData.length,
          });

          toast.success(`${processedData.length} registros importados com sucesso!`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Erro ao processar arquivo";
          setImportStatus({
            status: "error",
            message: `✗ ${errorMessage}`,
          });
          toast.error(errorMessage);
        } finally {
          setIsLoading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };

      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        reader.readAsBinaryString(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao ler arquivo";
      setImportStatus({
        status: "error",
        message: `✗ ${errorMessage}`,
      });
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white shadow-md">
      <CardHeader>
        <CardTitle className="text-lg sm:text-2xl">Importar Dados</CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          Carregue um arquivo Excel (.xlsx) ou CSV com os dados atualizados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instruções */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-900 mb-2">Instruções:</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>✓ O arquivo deve conter as colunas: "Data da Despesa" e "Valor lançamento"</li>
            <li>✓ Formatos aceitos: .xlsx, .xls ou .csv</li>
            <li>✓ Os dados serão processados e atualizarão o dashboard automaticamente</li>
          </ul>
        </div>

        {/* Upload */}
        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
          <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 mb-2">Clique ou arraste um arquivo</p>
          <p className="text-xs text-slate-500 mb-4">Excel (.xlsx, .xls) ou CSV</p>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            disabled={isLoading}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? "Processando..." : "Selecionar Arquivo"}
          </Button>
        </div>

        {/* Status */}
        {importStatus.status !== "idle" && (
          <div
            className={`flex items-start gap-3 p-4 rounded-lg ${
              importStatus.status === "success"
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {importStatus.status === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p
                className={`text-sm font-medium ${
                  importStatus.status === "success" ? "text-green-900" : "text-red-900"
                }`}
              >
                {importStatus.message}
              </p>
            </div>
          </div>
        )}

        {/* Informações */}
        <div className="bg-slate-50 rounded-lg p-4 text-xs text-slate-600">
          <p className="font-semibold mb-2">Como funciona:</p>
          <p>
            ✓ A nova base <strong>substitui completamente</strong> a anterior para análise<br/>
            ✓ A base antiga fica apenas como referência para preencher campos faltantes<br/>
            ✓ Todos os gráficos e filtros usarão apenas os dados da nova base
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
