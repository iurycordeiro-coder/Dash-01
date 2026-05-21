import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from "recharts";
import { Download, Upload } from "lucide-react";
import { ImportData } from "@/components/ImportData";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { formatarMoeda, formatarNumero, formatarPercentual, encontrarColuna, extrairValorMonetario } from "@/lib/formatters";
import { useDashboardSync } from "@/hooks/useDashboardSync";

type DashboardRow = Record<string, any>;

type DashboardAggregateRow = Record<string, string | number> & {
  "Valor lançamento": number;
};

interface DashboardData {
  kpis: {
    total_gastos: number;
    ticket_medio: number;
    total_transacoes: number;
  };
  gastos_categoria: DashboardAggregateRow[];
  gastos_unidade: DashboardAggregateRow[];
  gastos_regiao: DashboardAggregateRow[];
  gastos_nome: DashboardAggregateRow[];
  evolucao_temporal: DashboardAggregateRow[];
  gastos_status: DashboardAggregateRow[];
  gastos_prestacao: DashboardAggregateRow[];
  prestacao_por_pessoa: Array<any>;
  prestacao_por_mes: Array<any>;
  comparacao_periodos: Array<any>;
  raw_data: DashboardRow[];
  meses: Array<string>;
}

export function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [filteredData, setFilteredData] = useState<DashboardData | null>(null);
  const [selectedMes, setSelectedMes] = useState("Todos");
  const [selectedMesEvolucao, setSelectedMesEvolucao] = useState("Todos");
  const [selectedUnidades, setSelectedUnidades] = useState<string[]>(["Todas"]);
  const [selectedRegiao, setSelectedRegiao] = useState("Todas");
  const [selectedNomes, setSelectedNomes] = useState<string[]>(["Todos"]);
  const [singleSelectedName, setSingleSelectedName] = useState<string | null>(null);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [regioes, setRegioes] = useState<string[]>([]);
  const [nomes, setNomes] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("Data da Despesa");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [prestacaoSortOrder, setPrestacaoSortOrder] = useState<"desc" | "asc" | "alpha" | "alpha-desc">("desc");
  const [currentPage, setCurrentPage] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [topCategorias, setTopCategorias] = useState<number | "todas">(10);
  const itemsPerPage = 10;

  const DIRECTOR_NAMES = ["Gislane Gomes", "Alessandro Almeida De Souza"];
  const isDirector = (row: DashboardRow) => DIRECTOR_NAMES.includes(String(row?.Nome || "").trim());

  // Sincronização em tempo real
  const { isConnected, lastUpdate, saveDashboardData, fetchDashboardData } = useDashboardSync(
    (newData) => {
      console.log("🔄 Dashboard received data update callback", {
        hasData: !!newData,
        itemsCount: Array.isArray(newData?.raw_data) ? newData.raw_data.length : 0,
      });
      setData(newData);
      toast.success("✅ Dados atualizados em tempo real");
    }
  );

  useEffect(() => {
    const populateFilters = (jsonData: any) => {
      if (!jsonData?.raw_data?.length) return;

      const unidadesSet = new Set<string>();
      const regioesSet = new Set<string>();
      const nomesSet = new Set<string>();

      const rows = jsonData.raw_data.filter((row: any) => !isDirector(row));
      rows.forEach((row: any) => {
        if (row.Unidade) unidadesSet.add(row.Unidade);
        if (row.Região) regioesSet.add(row.Região);
        if (row.Nome) nomesSet.add(row.Nome);
      });

      setUnidades(["Todas", ...Array.from(unidadesSet).filter((u) => u && u.trim()).sort()]);
      setRegioes(["Todas", ...Array.from(regioesSet).filter((r) => r && r.trim()).sort()]);
      setNomes(["Todos", ...Array.from(nomesSet).filter((n) => n && n.trim()).sort()]);
    };

    const loadData = async () => {
      try {
        const response = await fetch("/api/dashboard/data");
        if (response.ok) {
          const result = await response.json();
          const apiData = result?.data ?? null;

          if (apiData) {
            setData(apiData);
            populateFilters(apiData);
            return;
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados da API:", error);
      }

      try {
        const response = await fetch("/dashboard_data.json");
        const jsonData = await response.json();
        setData(jsonData);
        populateFilters(jsonData);
      } catch (error) {
        console.error("Erro ao carregar dados de fallback:", error);
      }
    };

    loadData();
  }, []);

  const processedData = useMemo(() => {
    if (!data || !data.raw_data) return null;

    const generalRows = data.raw_data.filter((row: DashboardRow) => !isDirector(row));

    const filtered = generalRows.filter((row: DashboardRow) => {
      if (singleSelectedName && singleSelectedName !== "Todos") {
        return row.Nome === singleSelectedName;
      }
      const mesMatch = selectedMes === "Todos" || row["Mês"] === selectedMes;
      const unidadeMatch = selectedUnidades.includes("Todas") || selectedUnidades.includes(row.Unidade);
      const regiaoMatch = selectedRegiao === "Todas" || row.Região === selectedRegiao;
      const nomeMatch = selectedNomes.includes("Todos") || selectedNomes.includes(row.Nome);
      return mesMatch && unidadeMatch && regiaoMatch && nomeMatch;
    });

    const aggregateByField = (field: string, limit?: number): DashboardAggregateRow[] => {
      const map = new Map<string, number>();
      filtered.forEach((row: DashboardRow) => {
        const key = String(row[field] || `Sem ${field.toLowerCase()}`);
        map.set(key, (map.get(key) || 0) + (Number(row["Valor lançamento"]) || 0));
      });
      return Array.from(map, ([key, valor]) => ({
        [field]: key,
        "Valor lançamento": valor,
      })) as DashboardAggregateRow[];
    };

    const totalGastos = filtered.reduce((sum: number, row: DashboardRow) => sum + (Number(row["Valor lançamento"]) || 0), 0);
    const ticketMedio = filtered.length > 0 ? totalGastos / filtered.length : 0;

    const result: DashboardData = {
      kpis: {
        total_gastos: totalGastos,
        ticket_medio: ticketMedio,
        total_transacoes: filtered.length,
      },
      gastos_categoria: aggregateByField("Categoria Padronizada"),
      gastos_unidade: aggregateByField("Unidade"),
      gastos_regiao: aggregateByField("Região"),
      gastos_nome: aggregateByField("Nome", 10),
      evolucao_temporal: (() => {
        const map = new Map<string, number>();
        const evolucaoFiltered = selectedMesEvolucao === "Todos" 
          ? filtered 
          : filtered.filter((row: DashboardRow) => row["Mês"] === selectedMesEvolucao);
        evolucaoFiltered.forEach((row: DashboardRow) => {
          const date = row["Data da Despesa"] || "";
          map.set(date, (map.get(date) || 0) + (row["Valor lançamento"] || 0));
        });
        return Array.from(map, ([date, valor]) => ({
          "Data da Despesa": date,
          "Valor lançamento": valor,
        })).sort((a, b) => {
          const dateA = String(a["Data da Despesa"] || "");
          const dateB = String(b["Data da Despesa"] || "");
          return dateA.localeCompare(dateB);
        });
      })(),
      gastos_status: aggregateByField("Status prestação de contas"),
      gastos_prestacao: (() => {
        const prestadoValor = filtered.filter((r: DashboardRow) => {
          const status = String(r["Status prestação de contas"] || "").toLowerCase().trim();
          // Prestado = tudo que NÃO for "pendente" ou "reprovado"
          return status !== "pendente" && status !== "reprovado" && status !== "";
        }).reduce((sum: number, row: DashboardRow) => sum + (Number(row["Valor lançamento"]) || 0), 0);
        const naoPrestadoValor = totalGastos - prestadoValor;
        return [
          { "Status": "Prestado", "Valor lançamento": prestadoValor },
          { "Status": "Não Prestado", "Valor lançamento": naoPrestadoValor }
        ];
      })(),
      prestacao_por_mes: (() => {
        const map = new Map<string, { mes: string; prestado: number; nao_prestado: number }>();
        filtered.forEach((row: DashboardRow) => {
          const mes = String(row["Mês"] || "Sem mês");
          if (!map.has(mes)) map.set(mes, { mes, prestado: 0, nao_prestado: 0 });
          const item = map.get(mes)!;
          const valor = Number(row["Valor lançamento"]) || 0;
          const status = String(row["Status prestação de contas"] || "").toLowerCase().trim();
          if (status !== "pendente" && status !== "reprovado" && status !== "") {
            item.prestado += valor;
          } else {
            item.nao_prestado += valor;
          }
        });
        return Array.from(map.values()).sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
      })(),
      prestacao_por_pessoa: (() => {
        const map = new Map<string, any>();
        filtered.forEach((row: DashboardRow) => {
          const nome = String(row["Nome"] || "Sem nome");
          if (!map.has(nome)) {
            map.set(nome, {
              "Nome": nome,
              "Total Valor": 0,
              "Total Quantidade": 0,
              "Prestado Valor": 0,
              "Prestado Quantidade": 0,
              "Não Prestado Valor": 0,
              "Não Prestado Quantidade": 0,
            });
          }
          const pessoa = map.get(nome)!;
          const valor = row["Valor lançamento"] || 0;
          pessoa["Total Valor"] += valor;
          pessoa["Total Quantidade"] += 1;
          
          const status = String(row["Status prestação de contas"] || "").toLowerCase().trim();
          // Prestado = tudo que NÃO for "pendente" ou "reprovado"
          if (status !== "pendente" && status !== "reprovado" && status !== "") {
            pessoa["Prestado Valor"] += valor;
            pessoa["Prestado Quantidade"] += 1;
          } else {
            pessoa["Não Prestado Valor"] += valor;
            pessoa["Não Prestado Quantidade"] += 1;
          }
        });
        return Array.from(map.values()).map(pessoa => ({
          ...pessoa,
          "Prestado %": pessoa["Total Valor"] > 0 ? (pessoa["Prestado Valor"] / pessoa["Total Valor"] * 100) : 0,
          "Não Prestado %": pessoa["Total Valor"] > 0 ? (pessoa["Não Prestado Valor"] / pessoa["Total Valor"] * 100) : 0,
        })).sort((a, b) => b["Não Prestado Valor"] - a["Não Prestado Valor"]);
      })(),
      comparacao_periodos: data.comparacao_periodos || [],
      raw_data: filtered,
      meses: data.meses,
    };

    return result;
  }, [data, selectedMes, selectedUnidades, selectedRegiao, selectedNomes, singleSelectedName, selectedMesEvolucao]);

  // Update filtered data and reset pagination when processed data changes
  useEffect(() => {
    if (processedData) {
      setFilteredData(processedData);
      setCurrentPage(0);
    }
  }, [processedData]);

  if (!filteredData) return <div className="p-8">Carregando...</div>;

  const tableData = filteredData.raw_data
    .filter((row) =>
      searchTerm === "" ||
      Object.values(row).some((val) =>
        String(val).toLowerCase().includes(searchTerm.toLowerCase())
      )
    )
    .sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return sortOrder === "asc" ? comparison : -comparison;
    });

  const directorRows = data?.raw_data?.filter((row: DashboardRow) => isDirector(row)) || [];
  const directorTotalGastos = directorRows.reduce((sum: number, row: DashboardRow) => sum + (Number(row["Valor lançamento"]) || 0), 0);

  const allColumns = filteredData.raw_data.length > 0 ? Object.keys(filteredData.raw_data[0]) : [];

  const paginatedData = tableData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  const totalPages = Math.ceil(tableData.length / itemsPerPage);

  const handleNameSelect = (nome: string) => {
    if (singleSelectedName === nome) {
      setSingleSelectedName(null);
    } else {
      setSingleSelectedName(nome);
    }
  };

  const isFiltered = singleSelectedName && singleSelectedName !== "Todos";

  const renderPieLabel = (entry: any) => {
    return formatarNumero(entry.value);
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-2 border border-slate-200 rounded shadow-lg">
          <p className="text-sm font-medium">{payload[0].name}</p>
          <p className="text-sm text-slate-600">{formatarMoeda(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  const percentualPrestado = filteredData.kpis.total_gastos > 0 
    ? (filteredData.gastos_prestacao[0]?.["Valor lançamento"] / filteredData.kpis.total_gastos * 100) 
    : 0;

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filteredData.raw_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, `dashboard_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const exportToPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text("Dashboard de Despesas", 10, 10);
    doc.text(`Total de Gastos: ${formatarMoeda(filteredData.kpis.total_gastos)}`, 10, 20);
    doc.text(`Ticket Médio: ${formatarMoeda(filteredData.kpis.ticket_medio)}`, 10, 30);
    doc.save(`dashboard_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold">Dashboard de Despesas - Cartão Flash</h1>
          <p className="text-blue-100 mt-2 text-lg">Análise operacional de gastos - Apresentação Executiva</p>
          
          {/* Botões de Exportação */}
          <div className="flex gap-3 mt-6">
            <Button onClick={exportToExcel} className="bg-white text-blue-600 hover:bg-blue-50 font-semibold shadow-md">
              <Download className="w-4 h-4 mr-2" />
              Exportar Excel
            </Button>
            <Button onClick={exportToPDF} className="bg-red-500 hover:bg-red-600 text-white font-semibold shadow-md">
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {isFiltered && (
          <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
            <p className="text-blue-700 font-semibold">
              Filtrado por: <span className="font-bold">{singleSelectedName}</span>
              <button 
                onClick={() => setSingleSelectedName(null)}
                className="ml-4 text-blue-600 hover:text-blue-800 underline text-sm"
              >
                Limpar filtro
              </button>
            </p>
          </div>
        )}
        
        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-gray-200">
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Mês</label>
              <Select value={selectedMes} onValueChange={setSelectedMes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos os meses</SelectItem>
                  {data?.meses?.map((mes: string) => (
                    <SelectItem key={mes} value={mes}>{mes}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Unidade</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {selectedUnidades.length === 0 ? "Todas" : `${selectedUnidades.length} selecionadas`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0">
                  <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => setSelectedUnidades([])}
                    >
                      Todas
                    </Button>
                    {unidades.map((u) => (
                      <Button
                        key={u}
                        variant={selectedUnidades.includes(u) ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          setSelectedUnidades(
                            selectedUnidades.includes(u)
                              ? selectedUnidades.filter((x) => x !== u)
                              : [...selectedUnidades, u]
                          );
                        }}
                      >
                        {u}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Região</label>
              <Select value={selectedRegiao} onValueChange={setSelectedRegiao}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regioes.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-2 block">Nome</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    {selectedNomes.length === 0 ? "Todos" : `${selectedNomes.length} selecionados`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0">
                  <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      onClick={() => setSelectedNomes([])}
                    >
                      Todos
                    </Button>
                    {nomes.map((n) => (
                      <Button
                        key={n}
                        variant={selectedNomes.includes(n) ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => {
                          setSelectedNomes(
                            selectedNomes.includes(n)
                              ? selectedNomes.filter((x) => x !== n)
                              : [...selectedNomes, n]
                          );
                        }}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="visao-geral" className="w-full">
          <TabsList className="grid w-full grid-cols-7 bg-white border border-slate-200 rounded-lg p-1">
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="prestacao">Prestação</TabsTrigger>
            <TabsTrigger value="comparacao">Comparação</TabsTrigger>
            <TabsTrigger value="dados">Dados Detalhados</TabsTrigger>
            <TabsTrigger value="diretoria">Análise Diretoria</TabsTrigger>
            <TabsTrigger value="rede-bloom">REDE BLOOM</TabsTrigger>
            <TabsTrigger value="importar">Importar Dados</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral" className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-900">TOTAL DE GASTOS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">{formatarMoeda(filteredData.kpis.total_gastos)}</div>
                  <p className="text-xs text-blue-600 mt-2">Período: {data?.meses?.[0] || "N/A"} - {data?.meses?.[data.meses.length - 1] || "N/A"}</p>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-900">TICKET MÉDIO</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{formatarMoeda(filteredData.kpis.ticket_medio)}</div>
                  <p className="text-xs text-green-600 mt-2">Valor médio por transação</p>
                </CardContent>
              </Card>

              <Card className="bg-orange-50 border-orange-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-orange-900">TOTAL DE TRANSAÇÕES</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-orange-600">{filteredData.kpis.total_transacoes}</div>
                  <p className="text-xs text-orange-600 mt-2">Lançamentos registrados</p>
                </CardContent>
              </Card>

              <Card className="bg-pink-50 border-pink-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-pink-900">% PRESTADO</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-pink-600">{formatarPercentual(percentualPrestado)}</div>
                  <p className="text-xs text-pink-600 mt-2">Status: Crítico</p>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos - Pizza e Ranking lado a lado */}
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Gastos por Categoria</CardTitle>
                  <CardDescription>Top 10 categorias de despesa</CardDescription>
                  <div className="mt-4">
                    <Select value={String(topCategorias)} onValueChange={(value) => setTopCategorias(value === "todas" ? "todas" : parseInt(value))}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o top" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">Top 5</SelectItem>
                        <SelectItem value="10">Top 10</SelectItem>
                        <SelectItem value="15">Top 15</SelectItem>
                        <SelectItem value="20">Top 20</SelectItem>
                        <SelectItem value="todas">Todas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={topCategorias === "todas" ? filteredData.gastos_categoria : filteredData.gastos_categoria.slice(0, topCategorias)}
                        dataKey="Valor lançamento"
                        nameKey="Categoria Padronizada"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={renderPieLabel}
                      >
                        {(topCategorias === "todas" ? filteredData.gastos_categoria : filteredData.gastos_categoria.slice(0, topCategorias)).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1"][index % 10]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend layout="vertical" align="right" verticalAlign="middle" />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Ranking de Pessoas</CardTitle>
                  <CardDescription>Maiores gastos (sem Diretoria)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {filteredData.gastos_nome
                      .filter((pessoa: any) => !DIRECTOR_NAMES.includes(pessoa.Nome))
                      .slice(0, 10)
                      .map((pessoa: any, idx: number) => (
                      <div 
                        key={idx} 
                        onClick={() => handleNameSelect(pessoa.Nome)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          singleSelectedName === pessoa.Nome 
                            ? 'bg-blue-100 border-2 border-blue-500' 
                            : 'hover:bg-gray-100 border-2 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{pessoa.Nome}</p>
                            <p className="text-xs text-slate-500">{formatarMoeda(pessoa["Valor lançamento"])}</p>
                          </div>
                        </div>
                        <span className="text-sm font-medium ml-2 flex-shrink-0">{formatarPercentual((pessoa["Valor lançamento"] / filteredData.kpis.total_gastos) * 100)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Gráficos - Gastos por Unidade Full Width */}
            <Card>
              <CardHeader>
                <CardTitle>Gastos por Unidade</CardTitle>
                <CardDescription>Distribuição por unidade</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={filteredData.gastos_unidade} margin={{ top: 20, right: 30, bottom: 100, left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="Unidade" 
                      angle={-45}
                      textAnchor="end"
                      height={120}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis label={{ value: 'Valor (R$)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip cursor={{ fill: 'rgba(0,0,0,0.1)' }} formatter={(value) => formatarMoeda(value)} labelFormatter={(label) => `Unidade: ${label}`} />
                    <Bar dataKey="Valor lançamento" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Evolução Temporal</CardTitle>
                <CardDescription>Gastos por dia</CardDescription>
                <div className="mt-4">
                  <Select value={selectedMesEvolucao} onValueChange={setSelectedMesEvolucao}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um mês" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Todos">Todos os meses</SelectItem>
                      {filteredData?.meses?.map((mes: string) => (
                        <SelectItem key={mes} value={mes}>{mes}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={filteredData.evolucao_temporal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="Data da Despesa" 
                      tickFormatter={(value) => {
                        if (!value) return '';
                        try {
                          const num = parseInt(value);
                          if (isNaN(num)) return value;
                          const date = new Date((num - 1) * 86400000 + new Date('1900-01-01').getTime());
                          return date.toLocaleDateString('pt-BR');
                        } catch {
                          return value;
                        }
                      }}
                    />
                    <YAxis />
                    <Tooltip 
                      formatter={(value) => formatarMoeda(value)}
                      labelFormatter={(label) => {
                        if (!label) return '';
                        try {
                          const num = parseInt(label);
                          if (isNaN(num)) return label;
                          const date = new Date((num - 1) * 86400000 + new Date('1900-01-01').getTime());
                          return date.toLocaleDateString('pt-BR');
                        } catch {
                          return label;
                        }
                      }}
                    />
                    <Line type="monotone" dataKey="Valor lançamento" stroke="#3b82f6" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gráficos - Pizza Prestação e Bar Prestação por Mês lado a lado */}
            <div className="grid grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Status Prestação de Contas</CardTitle>
                  <CardDescription>Realizada vs Não Realizada</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={filteredData.gastos_prestacao}
                        dataKey="Valor lançamento"
                        nameKey="Status"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={renderPieLabel}
                      >
                        {filteredData.gastos_prestacao.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.Status === "Prestado" ? "#10b981" : "#ef4444"}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Prestação por Mês</CardTitle>
                  <CardDescription>Prestado vs Não Prestado por mês</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={filteredData.prestacao_por_mes}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" />
                      <YAxis />
                      <Tooltip formatter={(value) => formatarMoeda(value)} />
                      <Legend />
                      <Bar dataKey="prestado" fill="#10b981" name="Prestado" />
                      <Bar dataKey="nao_prestado" fill="#ef4444" name="Não Prestado" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Prestação */}
          <TabsContent value="prestacao">
            <Card>
              <CardHeader>
                <CardTitle>Análise de Prestação por Pessoa</CardTitle>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant={prestacaoSortOrder === "desc" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrestacaoSortOrder("desc")}
                  >
                    Maior Não Prestado
                  </Button>
                  <Button
                    variant={prestacaoSortOrder === "asc" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrestacaoSortOrder("asc")}
                  >
                    Menor Não Prestado
                  </Button>
                  <Button
                    variant={prestacaoSortOrder === "alpha" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrestacaoSortOrder("alpha")}
                  >
                    A-Z
                  </Button>
                  <Button
                    variant={prestacaoSortOrder === "alpha-desc" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPrestacaoSortOrder("alpha-desc")}
                  >
                    Z-A
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Total Valor</TableHead>
                        <TableHead className="text-right">Prestado Valor</TableHead>
                        <TableHead className="text-right">Não Prestado Valor</TableHead>
                        <TableHead className="text-right">Prestado %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredData.prestacao_por_pessoa
                        .filter((pessoa: any) => !DIRECTOR_NAMES.includes(pessoa.Nome))
                        .sort((a, b) => {
                          if (prestacaoSortOrder === "desc") {
                            return b["Não Prestado Valor"] - a["Não Prestado Valor"];
                          } else if (prestacaoSortOrder === "asc") {
                            return a["Não Prestado Valor"] - b["Não Prestado Valor"];
                          } else if (prestacaoSortOrder === "alpha") {
                            return String(a.Nome || "").localeCompare(String(b.Nome || ""));
                          } else if (prestacaoSortOrder === "alpha-desc") {
                            return String(b.Nome || "").localeCompare(String(a.Nome || ""));
                          }
                          return 0;
                        })
                        .map((pessoa: any, idx: number) => (
                        <TableRow key={idx} className={pessoa["Não Prestado Valor"] > 0 ? "bg-red-50" : "bg-green-50"}>
                          <TableCell className="font-medium">{pessoa.Nome}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(pessoa["Total Valor"])}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(pessoa["Prestado Valor"])}</TableCell>
                          <TableCell className="text-right">{formatarMoeda(pessoa["Não Prestado Valor"])}</TableCell>
                          <TableCell className="text-right">{formatarPercentual(pessoa["Prestado %"])}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Comparação */}
          <TabsContent value="comparacao">
            <Card>
              <CardHeader>
                <CardTitle>Comparação de Períodos</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={filteredData.comparacao_periodos}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="periodo" />
                    <YAxis />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="total_gastos" fill="#3b82f6" name="Total Gastos" />
                    <Bar dataKey="prestado" fill="#10b981" name="Prestado" />
                    <Bar dataKey="nao_prestado" fill="#ef4444" name="Não Prestado" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dados Detalhados */}
          <TabsContent value="dados">
            <Card>
              <CardHeader>
                <CardTitle>Dados Detalhados</CardTitle>
              </CardHeader>
              <CardContent>
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-4"
                />
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {allColumns.map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((row, idx) => (
                        <TableRow key={idx}>
                          {allColumns.map((col) => (
                            <TableCell key={col}>
                              {col === "Valor lançamento" ? formatarMoeda(row[col]) : String(row[col] || "")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-slate-600">
                    Página {currentPage + 1} de {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                    >
                      ← Anterior
                    </Button>
                    <Button
                      onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                      disabled={currentPage === totalPages - 1}
                    >
                      Próxima →
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Análise Diretoria */}
          <TabsContent value="diretoria">
            <Card>
              <CardHeader>
                <CardTitle>Análise Diretoria</CardTitle>
                <CardDescription>Maiores gastos da diretoria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {directorRows.length > 0 ?
                    (Array.from(
                      directorRows
                        .reduce((map: Map<string, number>, row: DashboardRow) => {
                          const nome = String(row.Nome || "Sem nome");
                          map.set(nome, (map.get(nome) || 0) + (Number(row["Valor lançamento"]) || 0));
                          return map;
                        }, new Map<string, number>())
                        .entries()
                    ) as [string, number][])
                      .map(([nome, valor]) => ({ Nome: nome, "Valor lançamento": valor }))
                      .sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"])
                      .map((pessoa: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm font-bold">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{pessoa.Nome}</p>
                              <p className="text-xs text-slate-500">{formatarMoeda(pessoa["Valor lançamento"])}</p>
                            </div>
                          </div>
                          <span className="text-sm font-medium">{formatarPercentual((pessoa["Valor lançamento"] / (directorTotalGastos || 1)) * 100)}</span>
                        </div>
                      ))
                    : <p className="text-sm text-slate-500">Nenhum registro de diretoria disponível.</p>
                  }
                </div>
              </CardContent>
            </Card>

            {/* Tabela de Prestacao Diretoria */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Analise de Prestacao - Diretoria</CardTitle>
                <CardDescription>Detalhamento de prestacao por pessoa da diretoria</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead className="text-right">Total Valor</TableHead>
                        <TableHead className="text-right">Prestado Valor</TableHead>
                        <TableHead className="text-right">Nao Prestado Valor</TableHead>
                        <TableHead className="text-right">Prestado %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {directorRows.length > 0 ?
                        Array.from(
                          directorRows
                            .reduce((map: Map<string, any>, row: DashboardRow) => {
                              const nome = String(row.Nome || "Sem nome");
                              if (!map.has(nome)) {
                                map.set(nome, {
                                  Nome: nome,
                                  "Total Valor": 0,
                                  "Prestado Valor": 0,
                                  "Não Prestado Valor": 0,
                                });
                              }
                              const pessoa = map.get(nome)!;
                              const valor = Number(row["Valor lançamento"]) || 0;
                              pessoa["Total Valor"] += valor;
                              const status = String(row["Status prestação de contas"] || "").toLowerCase().trim();
                              if (status !== "pendente" && status !== "reprovado" && status !== "") {
                                pessoa["Prestado Valor"] += valor;
                              } else {
                                pessoa["Não Prestado Valor"] += valor;
                              }
                              return map;
                            }, new Map<string, any>())
                            .values()
                        )
                          .map((pessoa: any) => ({
                            ...pessoa,
                            "Prestado %": pessoa["Total Valor"] > 0 ? (pessoa["Prestado Valor"] / pessoa["Total Valor"] * 100) : 0,
                          }))
                          .sort((a: any, b: any) => b["Total Valor"] - a["Total Valor"])
                          .map((pessoa: any, idx: number) => (
                            <TableRow key={idx}>
                              <TableCell className="font-medium">{pessoa.Nome}</TableCell>
                              <TableCell className="text-right">{formatarMoeda(pessoa["Total Valor"])}</TableCell>
                              <TableCell className="text-right text-green-600">{formatarMoeda(pessoa["Prestado Valor"])}</TableCell>
                              <TableCell className="text-right text-red-600">{formatarMoeda(pessoa["Não Prestado Valor"])}</TableCell>
                              <TableCell className="text-right font-medium">{formatarPercentual(pessoa["Prestado %"])}</TableCell>
                            </TableRow>
                          ))
                        : <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-slate-500">Nenhum registro de diretoria disponível.</TableCell>
                          </TableRow>
                      }
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* REDE BLOOM */}
          <TabsContent value="rede-bloom">
            <Card>
              <CardHeader>
                <CardTitle>REDE BLOOM</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Análise específica da Rede Bloom</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Importar Dados */}
          <TabsContent value="importar">
            <ImportData onDataImported={async (importedRows: any[]) => {
              if (!importedRows || importedRows.length === 0) return;
              
              // Função para preencher campos faltantes usando a base antiga como referência
              const fillMissingFields = (newRow: any, oldData: any[]) => {
                const filled = { ...newRow };
                
                // Se campos importantes estão faltando, tenta preencher com padrões da base antiga
                const fieldsToFill = ["Unidade", "Região", "Mês", "Categoria Padronizada", "Status prestação de contas"];
                
                fieldsToFill.forEach((field) => {
                  if (!filled[field] || filled[field] === "") {
                    // Procura um padrão na base antiga para o mesmo nome
                    const oldRecord = oldData.find((r: any) => r.Nome === newRow.Nome);
                    if (oldRecord && oldRecord[field]) {
                      filled[field] = oldRecord[field];
                    }
                  }
                });
                
                return filled;
              };
              
              // Normalizar nomes de colunas para aceitar variações com/sem acento
              const normalizeRow = (row: any) => {
                const normalized: any = {};
                
                // Copiar todos os valores
                Object.keys(row).forEach((key) => {
                  normalized[key] = row[key];
                });
                
                // Mapear "Valor lancamento" (sem acento) para "Valor lançamento"
                const valorKey = encontrarColuna(normalized, "valor lancamento");
                
                if (valorKey && valorKey !== "Valor lançamento") {
                  const valor = String(normalized[valorKey] || "0").replace(",", ".");
                  normalized["Valor lançamento"] = parseFloat(valor) || 0;
                  delete normalized[valorKey];
                } else if (normalized["Valor lançamento"] !== undefined) {
                  const valor = String(normalized["Valor lançamento"] || "0").replace(",", ".");
                  normalized["Valor lançamento"] = parseFloat(valor) || 0;
                }
                
                // Mapear "Status prestacao de contas" (sem acento) para "Status prestação de contas"
                const statusKey = encontrarColuna(normalized, "status prestacao");
                
                if (statusKey && statusKey !== "Status prestação de contas") {
                  normalized["Status prestação de contas"] = normalized[statusKey];
                  delete normalized[statusKey];
                }
                
                // Mapear "Categoria Padronizada"
                const categoriaKey = encontrarColuna(normalized, "categoria padronizada");
                
                if (categoriaKey && categoriaKey !== "Categoria Padronizada") {
                  normalized["Categoria Padronizada"] = normalized[categoriaKey];
                  delete normalized[categoriaKey];
                }
                
                return normalized;
              };
              
              const normalizedRows = importedRows.map(normalizeRow);
              
              // Preencher campos faltantes usando a base antiga como referência
              const oldRawData = data?.raw_data || [];
              const enrichedRows = normalizedRows.map((row: any) => fillMissingFields(row, oldRawData));
              
              // Processar dados importados para calcular agregações (usando dados enriquecidos)
              const processedData: DashboardData = {
                kpis: {
                  total_gastos: enrichedRows.reduce((sum, row) => sum + (row["Valor lançamento"] || 0), 0),
                  ticket_medio: 0,
                  total_transacoes: enrichedRows.length,
                },
                gastos_categoria: [],
                gastos_unidade: [],
                gastos_regiao: [],
                gastos_nome: [],
                evolucao_temporal: [],
                gastos_status: [],
                gastos_prestacao: [],
                prestacao_por_mes: [],
                prestacao_por_pessoa: [],
                comparacao_periodos: [],
                raw_data: enrichedRows,
                meses: data?.meses || [],
              };
              
              if (enrichedRows.length > 0) {
                processedData.kpis.ticket_medio = processedData.kpis.total_gastos / enrichedRows.length;
              }
              
              // Gastos por categoria
              const categoriaMap = new Map<string, number>();
              enrichedRows.forEach((row) => {
                const cat = row["Categoria Padronizada"] || "Sem categoria";
                categoriaMap.set(cat, (categoriaMap.get(cat) || 0) + (row["Valor lançamento"] || 0));
              });
              processedData.gastos_categoria = Array.from(categoriaMap, ([cat, valor]) => ({
                "Categoria Padronizada": cat,
                "Valor lançamento": valor,
              })).sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"]).slice(0, 10);
              
              // Gastos por unidade
              const unidadeMap = new Map<string, number>();
              enrichedRows.forEach((row) => {
                const un = row["Unidade"] || "Sem unidade";
                unidadeMap.set(un, (unidadeMap.get(un) || 0) + (row["Valor lançamento"] || 0));
              });
              processedData.gastos_unidade = Array.from(unidadeMap, ([un, valor]) => ({
                "Unidade": un,
                "Valor lançamento": valor,
              })).sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"]);
              
              // Gastos por região
              const regiaoMap = new Map<string, number>();
              enrichedRows.forEach((row) => {
                const reg = row["Região"] || "Sem região";
                regiaoMap.set(reg, (regiaoMap.get(reg) || 0) + (row["Valor lançamento"] || 0));
              });
              processedData.gastos_regiao = Array.from(regiaoMap, ([reg, valor]) => ({
                "Região": reg,
                "Valor lançamento": valor,
              })).sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"]);
              
              // Gastos por nome
              const nomeMap = new Map<string, number>();
              enrichedRows.forEach((row) => {
                const nome = row["Nome"] || "Sem nome";
                nomeMap.set(nome, (nomeMap.get(nome) || 0) + (row["Valor lançamento"] || 0));
              });
              processedData.gastos_nome = Array.from(nomeMap, ([nome, valor]) => ({
                "Nome": nome,
                "Valor lançamento": valor,
              })).sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"]).slice(0, 10);
              
              // Evolução temporal
              const dataMap = new Map<string, number>();
              enrichedRows.forEach((row) => {
                const data = row["Data da Despesa"] || "";
                dataMap.set(data, (dataMap.get(data) || 0) + (row["Valor lançamento"] || 0));
              });
              processedData.evolucao_temporal = Array.from(dataMap, ([data, valor]) => ({
                "Data da Despesa": data,
                "Valor lançamento": valor,
              })).sort((a, b) => {
                const dateA = String(a["Data da Despesa"] || "");
                const dateB = String(b["Data da Despesa"] || "");
                return dateA.localeCompare(dateB);
              });
              
              // Status de prestação
              const statusMap = new Map<string, number>();
              enrichedRows.forEach((row: DashboardRow) => {
                const status = row["Status prestação de contas"] || "Sem status";
                statusMap.set(status, (statusMap.get(status) || 0) + (Number(row["Valor lançamento"]) || 0));
              });
              processedData.gastos_status = Array.from(statusMap, ([status, valor]) => ({
                "Status": status,
                "Valor lançamento": valor,
              })).sort((a, b) => b["Valor lançamento"] - a["Valor lançamento"]);
              
              // Prestação realizada vs não realizada
              const prestadoValor = enrichedRows.filter((r: DashboardRow) => {
                const status = String(r["Status prestação de contas"] || "").toLowerCase().trim();
                // Prestado = tudo que NÃO for "pendente" ou "reprovado"
                return status !== "pendente" && status !== "reprovado" && status !== "";
              }).reduce((sum: number, row: DashboardRow) => sum + (Number(row["Valor lançamento"]) || 0), 0);
              const naoPrestadoValor = processedData.kpis.total_gastos - prestadoValor;
              processedData.gastos_prestacao = [
                { "Status": "Prestado", "Valor lançamento": prestadoValor },
                { "Status": "Não Prestado", "Valor lançamento": naoPrestadoValor }
              ];
              
              // Análise de prestação por pessoa
              const pessoaMap = new Map<string, any>();
              enrichedRows.forEach((row: DashboardRow) => {
                const nome = row["Nome"] || "Sem nome";
                if (!pessoaMap.has(nome)) {
                  pessoaMap.set(nome, {
                    "Nome": nome,
                    "Total Valor": 0,
                    "Total Quantidade": 0,
                    "Prestado Valor": 0,
                    "Prestado Quantidade": 0,
                    "Não Prestado Valor": 0,
                    "Não Prestado Quantidade": 0,
                  });
                }
                const pessoa = pessoaMap.get(nome)!;
                const valor = row["Valor lançamento"] || 0;
                pessoa["Total Valor"] += valor;
                pessoa["Total Quantidade"] += 1;
                
                const status = String(row["Status prestação de contas"] || "").toLowerCase().trim();
                // Prestado = tudo que NÃO for "pendente" ou "reprovado"
                if (status !== "pendente" && status !== "reprovado" && status !== "") {
                  pessoa["Prestado Valor"] += valor;
                  pessoa["Prestado Quantidade"] += 1;
                } else {
                  pessoa["Não Prestado Valor"] += valor;
                  pessoa["Não Prestado Quantidade"] += 1;
                }
              });
              // Prestação por mês
              const mesMap = new Map();
              enrichedRows.forEach((row: DashboardRow) => {
                const mes = row["Mês"] || "Sem mês";
                if (!mesMap.has(mes)) mesMap.set(mes, { mes, prestado: 0, nao_prestado: 0 });
                const item = mesMap.get(mes);
                const valor = Number(row["Valor lançamento"]) || 0;
                const status = String(row["Status prestação de contas"] || "").toLowerCase().trim();
                if (status !== "pendente" && status !== "reprovado" && status !== "") {
                  item.prestado += valor;
                } else {
                  item.nao_prestado += valor;
                }
              });
              processedData.prestacao_por_mes = Array.from(mesMap.values()).sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
              
              processedData.prestacao_por_pessoa = Array.from(pessoaMap.values()).map(pessoa => ({
                ...pessoa,
                "Prestado %": pessoa["Total Valor"] > 0 ? (pessoa["Prestado Valor"] / pessoa["Total Valor"] * 100) : 0,
                "Não Prestado %": pessoa["Total Valor"] > 0 ? (pessoa["Não Prestado Valor"] / pessoa["Total Valor"] * 100) : 0,
              })).sort((a, b) => b["Não Prestado Valor"] - a["Não Prestado Valor"]);
              
              // Extrair unidades, regiões e nomes dos dados importados (APENAS da nova base)
              const unidadesSet = new Set<string>();
              const regioesSet = new Set<string>();
              const nomesSet = new Set<string>();
              
              enrichedRows.forEach((row: DashboardRow) => {
                if (row.Unidade) unidadesSet.add(row.Unidade);
                if (row.Região) regioesSet.add(row.Região);
                if (row.Nome) nomesSet.add(row.Nome);
              });
              
              setUnidades(["Todas", ...Array.from(unidadesSet).filter(u => u && u.trim()).sort()]);
              setRegioes(["Todas", ...Array.from(regioesSet).filter(r => r && r.trim()).sort()]);
              setNomes(["Todos", ...Array.from(nomesSet).filter(n => n && n.trim()).sort()]);
              
              // Resetar filtros para "Todos"
              setSelectedUnidades(["Todas"]);
              setSelectedRegiao("Todas");
              setSelectedMes("Todos");
              setSelectedNomes(["Todos"]);
              
              // Resetar filtro de pessoa selecionada
              setSingleSelectedName(null);
              
              // Mostrar mensagem de sucesso
              toast.success(`Base importada com sucesso! ${enrichedRows.length} registros carregados.\nA base anterior foi usada apenas para preencher campos faltantes.`);
              
              // Atualizar estado local imediatamente com os dados completos processados
              setData(processedData);
              setFilteredData(processedData);
              
              // Sincronizar dados completos com o servidor
              console.log("💾 Saving complete processed data to server:", {
                hasRawData: !!processedData.raw_data,
                itemsCount: processedData.raw_data?.length,
                hasKpis: !!processedData.kpis,
              });
              
              try {
                // IMPORTANTE: Salvar o processedData COMPLETO, não apenas newData
                await saveDashboardData(processedData);
                console.log("✅ Complete data saved to server successfully");
                toast.success("✅ Dados sincronizados com sucesso");
              } catch (error) {
                console.error("❌ Erro ao sincronizar:", error);
                toast.error("❌ Erro ao sincronizar dados");
              }
            }} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default Dashboard;
