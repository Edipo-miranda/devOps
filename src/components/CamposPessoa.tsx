import { useState } from 'react'
import { Campo } from './CamposLocacao'
import { CampoData } from './CampoData'
import { ESTADOS_CIVIS, UFS, buscarCep, mascararCep, mascararCnpj, mascararCpf } from '../lib/documentos'
import type { EnderecoForm, Erros, PessoaForm } from '../lib/formularios'
import { capitalizarNome, minusculas } from '../lib/texto'

// ------------------------------------------------------------------ Endereço

interface PropsEndereco {
  valores: EnderecoForm
  aoMudar: (v: EnderecoForm) => void
  erros: Erros
  prefixo?: string // prefixo das chaves de erro (ex.: "end_")
}

/** CEP, rua, número, complemento, bairro, cidade e UF. Ao completar o CEP, busca o endereço. */
export function CamposEndereco({ valores, aoMudar, erros, prefixo = '' }: PropsEndereco) {
  const [buscando, setBuscando] = useState(false)
  const [avisoCep, setAvisoCep] = useState<string | null>(null)
  const set = (k: keyof EnderecoForm, v: string) => aoMudar({ ...valores, [k]: v })

  async function mudarCep(texto: string) {
    const cep = mascararCep(texto)
    aoMudar({ ...valores, cep })
    setAvisoCep(null)
    if (cep.length !== 9) return
    setBuscando(true)
    const achado = await buscarCep(cep)
    setBuscando(false)
    if (!achado) {
      setAvisoCep('CEP não encontrado (ou sem internet). Preencha o endereço manualmente.')
      return
    }
    if (!achado.logradouro) setAvisoCep('CEP geral da cidade: cidade e UF preenchidas. Digite a rua e o bairro.')
    aoMudar({
      ...valores,
      cep,
      logradouro: achado.logradouro ?? valores.logradouro,
      bairro: achado.bairro ?? valores.bairro,
      cidade: achado.cidade ?? valores.cidade,
      uf: achado.uf ?? valores.uf,
    })
  }

  return (
    <>
      <div className="grade-endereco-1">
        <Campo rotulo="CEP" dica={buscando ? 'buscando…' : 'preenche o endereço'} erro={erros[prefixo + 'cep'] ?? avisoCep ?? undefined}>
          <input value={valores.cep} onChange={(e) => mudarCep(e.target.value)} inputMode="numeric" placeholder="00000-000" maxLength={9} />
        </Campo>
        <Campo rotulo="Rua / Avenida" erro={erros[prefixo + 'logradouro']}>
          <input value={valores.logradouro} onChange={(e) => set('logradouro', e.target.value)} onBlur={() => set('logradouro', capitalizarNome(valores.logradouro))} maxLength={200} />
        </Campo>
        <Campo rotulo="Número" erro={erros[prefixo + 'numero']}>
          <input value={valores.numero} onChange={(e) => set('numero', e.target.value)} maxLength={20} placeholder="123 ou s/n" />
        </Campo>
      </div>
      <div className="grade-endereco-2">
        <Campo rotulo="Complemento" dica="opcional">
          <input value={valores.complemento} onChange={(e) => set('complemento', e.target.value)} onBlur={() => set('complemento', capitalizarNome(valores.complemento))} maxLength={100} placeholder="Apto, bloco, fundos…" />
        </Campo>
        <Campo rotulo="Bairro" erro={erros[prefixo + 'bairro']}>
          <input value={valores.bairro} onChange={(e) => set('bairro', e.target.value)} onBlur={() => set('bairro', capitalizarNome(valores.bairro))} maxLength={100} />
        </Campo>
        <Campo rotulo="Cidade" erro={erros[prefixo + 'cidade']}>
          <input value={valores.cidade} onChange={(e) => set('cidade', e.target.value)} onBlur={() => set('cidade', capitalizarNome(valores.cidade))} maxLength={100} />
        </Campo>
        <Campo rotulo="UF" erro={erros[prefixo + 'uf']}>
          <select value={valores.uf} onChange={(e) => set('uf', e.target.value)}>
            <option value="">—</option>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
    </>
  )
}

// ------------------------------------------------------------ Dados pessoais

interface PropsPessoa {
  valores: PessoaForm
  aoMudar: (v: PessoaForm) => void
  erros: Erros
  juridica?: boolean // proprietário pessoa jurídica (CNPJ)
  comNascimento?: boolean
  rotuloEndereco?: string
}

/** Nome, telefone, documentos, estado civil, profissão, e-mail e endereço. */
export function CamposPessoa({ valores, aoMudar, erros, juridica, comNascimento, rotuloEndereco = 'Endereço' }: PropsPessoa) {
  const set = <K extends keyof PessoaForm>(k: K, v: PessoaForm[K]) => aoMudar({ ...valores, [k]: v })

  return (
    <>
      <div className="grade-2">
        <Campo rotulo={juridica ? 'Razão social' : 'Nome completo'} erro={erros.nome}>
          <input value={valores.nome} onChange={(e) => set('nome', e.target.value)} onBlur={() => !juridica && set('nome', capitalizarNome(valores.nome))} maxLength={150} autoComplete="off" />
        </Campo>
        <Campo rotulo="Telefone" dica="opcional" erro={erros.telefone}>
          <input value={valores.telefone} onChange={(e) => set('telefone', e.target.value)} inputMode="tel" placeholder="(11) 98765-4321" maxLength={20} />
        </Campo>
      </div>
      <div className="grade-3">
        <Campo rotulo={juridica ? 'CNPJ' : 'CPF'} erro={erros.documento}>
          <input
            value={valores.documento}
            onChange={(e) => set('documento', juridica ? mascararCnpj(e.target.value) : mascararCpf(e.target.value))}
            inputMode="numeric"
            placeholder={juridica ? '00.000.000/0000-00' : '000.000.000-00'}
          />
        </Campo>
        {!juridica && (
          <>
            <Campo rotulo="RG">
              <input value={valores.rg} onChange={(e) => set('rg', e.target.value)} maxLength={20} />
            </Campo>
            <Campo rotulo="Órgão emissor">
              <input value={valores.orgao_emissor} onChange={(e) => set('orgao_emissor', e.target.value.toUpperCase())} maxLength={20} placeholder="SSP/SP" />
            </Campo>
          </>
        )}
      </div>
      {!juridica && (
        <div className="grade-3">
          <Campo rotulo="Nacionalidade">
            <input value={valores.nacionalidade} onChange={(e) => set('nacionalidade', e.target.value)} onBlur={() => set('nacionalidade', minusculas(valores.nacionalidade))} maxLength={40} />
          </Campo>
          <Campo rotulo="Estado civil">
            <select value={valores.estado_civil} onChange={(e) => set('estado_civil', e.target.value)}>
              <option value="">—</option>
              {ESTADOS_CIVIS.map((ec) => <option key={ec} value={ec}>{ec}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Profissão">
            <input value={valores.profissao} onChange={(e) => set('profissao', e.target.value)} onBlur={() => set('profissao', minusculas(valores.profissao))} maxLength={60} />
          </Campo>
        </div>
      )}
      <div className="grade-3">
        {!juridica && (
          <Campo rotulo="Gênero" dica="concordância no contrato">
            <select value={valores.genero} onChange={(e) => set('genero', e.target.value as PessoaForm['genero'])}>
              <option value="">—</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
          </Campo>
        )}
        <Campo rotulo="E-mail" dica="opcional" erro={erros.email}>
          <input type="email" value={valores.email} onChange={(e) => set('email', e.target.value)} maxLength={120} />
        </Campo>
        {comNascimento && !juridica && (
          <Campo rotulo="Data de nascimento" dica="opcional" erro={erros.data_nascimento}>
            <CampoData valor={valores.data_nascimento} aoMudar={(v) => set('data_nascimento', v)} />
          </Campo>
        )}
      </div>
      <p className="subtitulo-form">{rotuloEndereco}</p>
      <CamposEndereco valores={valores.endereco} aoMudar={(v) => set('endereco', v)} erros={erros} prefixo="end_" />
    </>
  )
}
