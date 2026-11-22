import type { ReactNode } from 'react'
import type { Inquilino } from '../types/database'
import { CampoData } from './CampoData'
import { CamposPessoa } from './CamposPessoa'
import { GARANTIAS, INDICES, mascararCpf } from '../lib/documentos'
import { capitalizarNome } from '../lib/texto'
import type { Erros } from '../lib/formularios'
import { errosComPrefixo, type CondicoesForm, type ErrosLocacao, type ValoresContrato, type ValoresLocacao } from '../lib/validacaoLocacao'

export function Campo({ rotulo, dica, erro, children }: { rotulo: string; dica?: string; erro?: string; children: ReactNode }) {
  return (
    <label className={`campo ${erro ? 'campo--erro' : ''}`}>
      <span>
        {rotulo} {dica && <small className="texto-suave">({dica})</small>}
      </span>
      {children}
      {erro && <small className="campo__erro">{erro}</small>}
    </label>
  )
}

/** Bloco que abre e fecha (usado para as partes longas dos formulários). */
export function Secao({ titulo, dica, aberta, temErro, children }: { titulo: string; dica?: string; aberta?: boolean; temErro?: boolean; children: ReactNode }) {
  return (
    <details className={`secao-expansivel ${temErro ? 'secao-expansivel--erro' : ''}`} open={aberta || temErro}>
      <summary>
        <span>{titulo}</span>
        {dica && <small className="texto-suave">{dica}</small>}
      </summary>
      <div className="secao-expansivel__conteudo">{children}</div>
    </details>
  )
}

interface Props {
  valores: ValoresLocacao
  erros: ErrosLocacao
  inquilinos: Inquilino[]
  aoMudar: (v: ValoresLocacao) => void
}

/** Inquilino (novo ou já cadastrado), valores da locação, prazo/reajuste e condições do contrato. */
export function CamposLocacao({ valores, erros, inquilinos, aoMudar }: Props) {
  const set = <K extends keyof ValoresLocacao>(k: K, val: ValoresLocacao[K]) => aoMudar({ ...valores, [k]: val })
  const errosInq = errosComPrefixo(erros, 'inq.')
  const errosCond = errosComPrefixo(erros, 'cond.')

  return (
    <>
      {inquilinos.length > 0 && (
        <div className="alternador" role="radiogroup" aria-label="Inquilino">
          <button type="button" role="radio" aria-checked={valores.modoInquilino === 'novo'}
            className={valores.modoInquilino === 'novo' ? 'ativo' : ''} onClick={() => set('modoInquilino', 'novo')}>
            Novo inquilino
          </button>
          <button type="button" role="radio" aria-checked={valores.modoInquilino === 'existente'}
            className={valores.modoInquilino === 'existente' ? 'ativo' : ''} onClick={() => set('modoInquilino', 'existente')}>
            Já cadastrado
          </button>
        </div>
      )}

      {valores.modoInquilino === 'existente' ? (
        <Campo rotulo="Inquilino" erro={erros.inquilinoId}>
          <select value={valores.inquilinoId} onChange={(e) => set('inquilinoId', e.target.value)}>
            <option value="">Selecione…</option>
            {inquilinos.map((i) => (
              <option key={i.id} value={i.id}>{i.nome}{i.cpf ? ` — CPF ${i.cpf}` : i.telefone ? ` — ${i.telefone}` : ''}</option>
            ))}
          </select>
        </Campo>
      ) : (
        <Secao titulo="Dados do inquilino" dica="nome obrigatório; o resto é usado no contrato" aberta temErro={Object.keys(errosInq).length > 0}>
          <CamposPessoa valores={valores.inquilino} aoMudar={(p) => set('inquilino', p)} erros={errosInq} comNascimento rotuloEndereco="Endereço atual do inquilino (opcional)" />
        </Secao>
      )}

      <p className="subtitulo-form">Aluguel</p>
      <div className="grade-3">
        <Campo rotulo="Data de entrada" erro={erros.dataEntrada}>
          <CampoData valor={valores.dataEntrada} aoMudar={(v) => set('dataEntrada', v)} />
        </Campo>
        <Campo rotulo="Valor do aluguel (R$)" erro={erros.valor}>
          <input value={valores.valor} onChange={(e) => set('valor', e.target.value)} inputMode="decimal" placeholder="1.500,00" />
        </Campo>
        <Campo rotulo="Dia de vencimento" erro={erros.dia}>
          <input type="number" min={1} max={31} value={valores.dia} onChange={(e) => set('dia', e.target.value)} placeholder="10" />
        </Campo>
      </div>
      <CamposContrato valores={valores} erros={erros} aoMudar={(c) => aoMudar({ ...valores, ...c })} />

      <Secao titulo="Condições do contrato" dica="garantia, multa, foro e cláusulas" temErro={Object.keys(errosCond).length > 0}>
        <CamposCondicoes valores={valores.condicoes} aoMudar={(c) => set('condicoes', c)} erros={errosCond} />
      </Secao>
    </>
  )
}

/** Prazo do contrato e periodicidade do reajuste (cadastro e edição da locação). */
export function CamposContrato({ valores, erros, aoMudar }: {
  valores: ValoresContrato
  erros: Erros
  aoMudar: (v: ValoresContrato) => void
}) {
  const set = (k: keyof ValoresContrato, val: string) =>
    aoMudar({ prazo: valores.prazo, reajuste: valores.reajuste, [k]: val })

  return (
    <div className="grade-2">
      <Campo rotulo="Prazo do contrato (meses)" dica="vazio = indeterminado" erro={erros.prazo}>
        <input type="number" min={1} max={240} value={valores.prazo} onChange={(e) => set('prazo', e.target.value)} placeholder="12" />
      </Campo>
      <Campo rotulo="Reajuste a cada (meses)" dica="vazio = sem reajuste" erro={erros.reajuste}>
        <input type="number" min={1} max={120} value={valores.reajuste} onChange={(e) => set('reajuste', e.target.value)} placeholder="12" />
      </Campo>
    </div>
  )
}

/** Finalidade, garantia/fiador, multa e juros (texto do contrato), encargos, foro e cláusulas adicionais. */
export function CamposCondicoes({ valores, aoMudar, erros }: { valores: CondicoesForm; aoMudar: (v: CondicoesForm) => void; erros: Erros }) {
  const set = <K extends keyof CondicoesForm>(k: K, v: CondicoesForm[K]) => aoMudar({ ...valores, [k]: v })

  return (
    <>
      <div className="grade-3">
        <Campo rotulo="Finalidade">
          <select value={valores.finalidade} onChange={(e) => set('finalidade', e.target.value as CondicoesForm['finalidade'])}>
            <option value="residencial">Residencial</option>
            <option value="comercial">Comercial</option>
          </select>
        </Campo>
        <Campo rotulo="Garantia">
          <select value={valores.garantia} onChange={(e) => set('garantia', e.target.value as CondicoesForm['garantia'])}>
            {Object.entries(GARANTIAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        {valores.garantia !== 'nenhuma' && valores.garantia !== 'fiador' && (
          <Campo rotulo={valores.garantia === 'caucao' ? 'Valor da caução (R$)' : 'Valor da garantia (R$)'} erro={erros.valorGarantia}>
            <input value={valores.valorGarantia} onChange={(e) => set('valorGarantia', e.target.value)} inputMode="decimal" placeholder="4.500,00" />
          </Campo>
        )}
      </div>

      {valores.garantia === 'fiador' && (
        <>
          <div className="grade-2">
            <Campo rotulo="Nome do fiador" erro={erros.fiadorNome}>
              <input value={valores.fiadorNome} onChange={(e) => set('fiadorNome', e.target.value)} onBlur={() => set('fiadorNome', capitalizarNome(valores.fiadorNome))} maxLength={150} />
            </Campo>
            <Campo rotulo="CPF do fiador" erro={erros.fiadorCpf}>
              <input value={valores.fiadorCpf} onChange={(e) => set('fiadorCpf', mascararCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
            </Campo>
          </div>
          <Campo rotulo="Qualificação e endereço do fiador" dica="nacionalidade, estado civil, profissão, RG, endereço">
            <textarea rows={2} value={valores.fiadorQualificacao} onChange={(e) => set('fiadorQualificacao', e.target.value)} maxLength={1000}
              placeholder="brasileiro, casado, engenheiro, RG 00.000.000-0 SSP/SP, residente na Rua…, nº…, Bairro…, Cidade/UF" />
          </Campo>
        </>
      )}

      <div className="grade-2">
        <Campo rotulo="Índice do reajuste" dica="vai no contrato">
          <select value={valores.indice} onChange={(e) => set('indice', e.target.value as CondicoesForm['indice'])}>
            {Object.entries(INDICES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </select>
        </Campo>
        <Campo rotulo="IPTU por conta do">
          <select value={valores.iptu} onChange={(e) => set('iptu', e.target.value as CondicoesForm['iptu'])}>
            <option value="locador">Proprietário (locador)</option>
            <option value="locatario">Inquilino (locatário)</option>
          </select>
        </Campo>
      </div>
      <div className="grade-3">
        <Campo rotulo="Multa por atraso (%)" dica="texto do contrato" erro={erros.multaAtraso}>
          <input value={valores.multaAtraso} onChange={(e) => set('multaAtraso', e.target.value)} inputMode="decimal" placeholder="10" />
        </Campo>
        <Campo rotulo="Juros por atraso (% ao mês)" erro={erros.jurosAtraso}>
          <input value={valores.jurosAtraso} onChange={(e) => set('jurosAtraso', e.target.value)} inputMode="decimal" placeholder="1" />
        </Campo>
        <Campo rotulo="Multa por rescisão (nº de aluguéis)" erro={erros.multaRescisao}>
          <input value={valores.multaRescisao} onChange={(e) => set('multaRescisao', e.target.value)} inputMode="decimal" placeholder="3" />
        </Campo>
      </div>
      <Campo rotulo="Consumos por conta do inquilino" dica="completa a frase: “…incluindo ___”">
        <textarea rows={2} value={valores.encargos} onChange={(e) => set('encargos', e.target.value)} maxLength={1000} />
      </Campo>
      <Campo rotulo="Foro (cidade/UF)" dica="vazio = cidade do imóvel">
        <input value={valores.foro} onChange={(e) => set('foro', e.target.value)} maxLength={100} placeholder="Campinas/SP" />
      </Campo>
      <Campo rotulo="Cláusulas adicionais" dica="opcional; uma por linha" erro={erros.clausulas}>
        <textarea rows={3} value={valores.clausulas} onChange={(e) => set('clausulas', e.target.value)} maxLength={5000}
          placeholder="Ex.: Não é permitido animais de grande porte." />
      </Campo>
    </>
  )
}
