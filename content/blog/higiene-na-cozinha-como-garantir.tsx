import Link from "next/link";

export default function Body() {
  return (
    <>
      <p>
        Higiene em cozinha de restaurante não é só obrigação legal — é
        reputação. Uma intoxicação alimentar ou uma autuação da vigilância
        sanitária pode fechar o negócio. E, no entanto, a maioria dos
        restaurantes ainda controla higiene com a memória da equipe e um papel
        colado na parede que ninguém lê. Tecnologia muda esse jogo ao tornar o
        padrão de higiene <strong>monitorável e auditável</strong>.
      </p>

      <h2>O que a legislação exige (RDC 216)</h2>
      <p>
        A RDC 216 da Anvisa estabelece boas práticas para serviços de
        alimentação: higienização de instalações e equipamentos, controle de
        temperatura, higiene de manipuladores, controle de pragas e
        rastreabilidade. O ponto-chave para o gestor é a palavra{" "}
        <strong>registro</strong>: não basta fazer, é preciso comprovar.
      </p>
      <ul>
        <li>Higienização de superfícies, utensílios e equipamentos.</li>
        <li>Controle de temperatura de câmaras, geladeiras e cocção.</li>
        <li>Higiene e saúde dos manipuladores.</li>
        <li>Recebimento e armazenamento corretos dos insumos.</li>
      </ul>

      <h2>Por que o controle manual falha</h2>
      <p>
        O problema não é a equipe não saber higienizar — é não haver um sistema
        que garanta que aconteceu e que prove para a fiscalização. A planilha de
        temperatura preenchida "de cabeça" no fim do dia não tem valor real, e
        todo mundo sabe disso.
      </p>

      <h2>Como a tecnologia garante o padrão</h2>
      <h3>Checklist com foto obrigatória</h3>
      <p>
        Quando o item "higienizar bancada de manipulação" exige uma foto, a
        tarefa deixa de ser uma marcação automática e passa a ser uma evidência.
        Veja como montar um{" "}
        <Link href="/modelos/checklist-limpeza-restaurante">
          checklist de limpeza
        </Link>{" "}
        que a equipe realmente executa.
      </p>
      <h3>Registro de temperatura com horário</h3>
      <p>
        Cada leitura fica carimbada com data e hora reais. Se a câmara fria
        passou da faixa segura, o histórico mostra quando — e o gestor age antes
        de virar prejuízo ou risco sanitário.
      </p>
      <h3>Histórico para a vigilância</h3>
      <p>
        Numa visita de fiscalização, em vez de procurar papéis, você abre o
        sistema e mostra semanas de registros com foto e responsável. Isso é
        rastreabilidade de verdade.
      </p>

      <h2>Higiene começa no recebimento</h2>
      <p>
        Boa parte dos problemas de higiene entra pela porta dos fundos:
        mercadoria recebida fora da temperatura, validade curta, embalagem
        violada. Um{" "}
        <Link href="/modelos/checklist-recebimento-restaurante">
          checklist de recebimento de mercadorias
        </Link>{" "}
        impede que o insumo errado chegue à cozinha.
      </p>

      <h2>Padrão de higiene é execução, não intenção</h2>
      <p>
        Todo restaurante "quer" ter higiene impecável. A diferença entre querer e
        ter é a <Link href="/execucao-operacional">execução operacional</Link>:
        transformar a intenção em rotina diária, verificável e auditável. É
        exatamente para isso que o Ordem na Mesa existe.
      </p>
    </>
  );
}
