import Link from "next/link";

export default function Body() {
  return (
    <>
      <p>
        Toda operação de restaurante depende de rotinas: abrir a cozinha, ligar
        equipamentos, conferir temperaturas, repor estoque, limpar o salão,
        fechar o caixa. Quando essas rotinas vivem na cabeça das pessoas — ou em
        papéis e planilhas soltas —, elas falham exatamente nos dias mais
        corridos. Um <strong>checklist digital</strong> é o que transforma essa
        rotina em algo que acontece <em>de verdade</em>, todos os dias, com
        prova de que foi feito.
      </p>

      <h2>O problema do papel e da planilha</h2>
      <p>
        O checklist de papel parece barato, mas custa caro. Ele não avisa quando
        uma tarefa foi esquecida, não tem foto, não mostra quem fez, e some na
        primeira faxina. A planilha melhora um pouco, mas continua dependendo de
        alguém lembrar de preencher — e ninguém audita 30 planilhas por semana.
      </p>
      <ul>
        <li>
          <strong>Sem rastreabilidade:</strong> você não sabe se a câmara fria
          foi conferida às 8h ou se alguém só marcou tudo no fim do turno.
        </li>
        <li>
          <strong>Sem evidência:</strong> "limpei o fritador" não é a mesma
          coisa que uma foto do fritador limpo.
        </li>
        <li>
          <strong>Sem padrão:</strong> cada funcionário faz à sua maneira, e o
          resultado varia conforme quem está de turno.
        </li>
      </ul>

      <h2>O que muda com um checklist digital</h2>
      <p>
        Um checklist digital de execução operacional resolve isso porque torna a
        tarefa <strong>verificável</strong>. No Ordem na Mesa, cada item pode
        exigir foto, ser marcado como crítico e seguir uma ordem obrigatória.
        Quando a equipe executa pelo celular, o gestor vê em tempo real o que
        foi feito, por quem e quando.
      </p>
      <h3>1. Evidência fotográfica</h3>
      <p>
        A foto acaba com o "achismo". Em vez de discutir se a praça foi
        higienizada, você olha a imagem. Isso muda o comportamento da equipe: o
        que é registrado com foto é feito com mais cuidado.
      </p>
      <h3>2. Histórico auditável</h3>
      <p>
        Cada execução fica gravada com data, hora e responsável. Em uma visita
        da vigilância sanitária, ou em uma reclamação de cliente, você tem o
        histórico para provar o que aconteceu — sem depender da memória de
        ninguém.
      </p>
      <h3>3. Padronização real</h3>
      <p>
        Quando a rotina está no sistema, o turno da noite faz exatamente o que o
        turno da manhã faz. É assim que uma operação{" "}
        <Link href="/execucao-operacional">roda no padrão</Link> mesmo quando o
        dono não está presente.
      </p>

      <h2>Por onde começar</h2>
      <p>
        Não tente digitalizar tudo de uma vez. Comece pelas duas rotinas que
        mais doem quando falham:
      </p>
      <ul>
        <li>
          <Link href="/modelos/checklist-abertura-hamburgueria">
            Checklist de abertura
          </Link>{" "}
          — garante que o restaurante abre pronto para vender.
        </li>
        <li>
          <Link href="/modelos/checklist-limpeza-restaurante">
            Checklist de limpeza
          </Link>{" "}
          — o que mais gera problema sanitário e reclamação.
        </li>
      </ul>
      <p>
        Depois expanda para{" "}
        <Link href="/modelos/checklist-recebimento-restaurante">
          recebimento de mercadorias
        </Link>{" "}
        e{" "}
        <Link href="/modelos/checklist-controle-estoque-restaurante">
          controle de estoque
        </Link>
        . Em poucas semanas, a operação inteira está padronizada.
      </p>

      <h2>Checklist digital não é PDV</h2>
      <p>
        Vale a distinção: um PDV cuida de pedidos, vendas e delivery. Uma{" "}
        <strong>plataforma de execução operacional</strong> cuida de como a
        operação roda — as rotinas, a equipe, os padrões. São camadas
        diferentes e complementares. O Ordem na Mesa é a segunda: ele não
        substitui seu sistema de vendas, ele garante que a operação por trás da
        venda aconteça certo.
      </p>
    </>
  );
}
