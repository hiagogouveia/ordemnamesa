import Link from "next/link";

export default function Body() {
  return (
    <>
      <blockquote>
        <strong>Resposta direta:</strong> não existe um preço único de mercado. A
        maioria dos fornecedores trabalha <strong>sob consulta</strong>, definindo
        o valor por <strong>número de unidades, usuários e recursos</strong>
        {" "}(evidência fotográfica, auditoria, multiunidade). A única{" "}
        <strong>referência pública</strong> que encontramos foi de cerca de{" "}
        <strong>R$ 99/mês por loja</strong> (Checkbits) — um ponto isolado,{" "}
        <strong>não a média do mercado</strong>. Para a maioria dos sistemas, é
        preciso pedir orçamento.
      </blockquote>

      <p>
        <em>
          Metodologia: preços e condições levantados em junho de 2026 nos sites
          oficiais dos fornecedores e no Capterra. Valores e planos mudam com
          frequência — confirme com cada fornecedor antes de decidir.
        </em>
      </p>

      <p>
        A pergunta "quanto custa" quase nunca tem uma etiqueta de preço única — e
        isso não é falta de transparência sua, é como o mercado funciona. Abaixo
        você encontra o que é público hoje, os modelos de cobrança, um método
        para estimar o custo da sua operação e o que pesar além do valor mensal.
      </p>

      <h2>Quanto custa, na prática</h2>
      <p>
        Levantamento dos preços divulgados publicamente pelos principais sistemas
        (junho de 2026 — confirme sempre com cada fornecedor):
      </p>
      <table>
        <thead>
          <tr>
            <th>Sistema</th>
            <th>Preço público</th>
            <th>Modelo</th>
            <th>Fonte</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Checkbits</td><td>R$ 99/mês por loja (até 10 usuários)</td><td>Por loja (CNPJ)</td><td>Site oficial</td></tr>
          <tr><td>Koncluí</td><td>Sob consulta</td><td>Demonstração</td><td>Site oficial</td></tr>
          <tr><td>Sults</td><td>Sob consulta (teste 14 dias)</td><td>Enterprise</td><td>Site / Capterra</td></tr>
          <tr><td>Food Sistemas</td><td>Sob consulta</td><td>Sob proposta</td><td>Site oficial</td></tr>
          <tr><td>Checklist Fácil</td><td>Sob consulta</td><td>Enterprise</td><td>Capterra ("sem informação do fornecedor")</td></tr>
          <tr><td>Ordem na Mesa</td><td>Sob medida (30 dias grátis)</td><td>Sob a operação</td><td>Site oficial</td></tr>
        </tbody>
      </table>
      <p>
        Em resumo: um único fornecedor publica preço aberto (Checkbits, por loja);
        os demais avaliam o tamanho da operação antes de passar um valor. Para a
        maioria, você precisará pedir um orçamento — e este guia ajuda a fazer
        isso bem.
      </p>

      <h2>Modelos de cobrança</h2>
      <p>
        Entender o modelo explica por que um sistema diz "R$ 99" e outro diz "fale
        com a gente". São quatro:
      </p>
      <h3>Por loja/CNPJ</h3>
      <p>
        Você paga um valor fixo por unidade, geralmente com um limite de usuários
        incluído. É o modelo mais previsível para quem tem poucas lojas e equipe
        enxuta. Exemplo público: Checkbits cobra por loja (CNPJ), com até 10
        usuários no valor.
      </p>
      <h3>Por usuário</h3>
      <p>
        O preço acompanha o número de pessoas que acessam o sistema. Faz sentido
        quando poucas pessoas executam as rotinas; encarece rápido quando a equipe
        é grande ou rotativa. Confirme quem conta como usuário (só líderes ou toda
        a equipe?).
      </p>
      <h3>Por unidade</h3>
      <p>
        Semelhante ao "por loja", mas comum em redes: o valor escala conforme o
        número de unidades, às vezes com desconto por volume. Útil para padronizar
        várias operações sob um painel só.
      </p>
      <h3>Enterprise / sob consulta</h3>
      <p>
        O fornecedor monta uma proposta após entender porte, número de unidades,
        integrações e recursos. É o modelo da maioria. Não há valor de tabela
        porque o escopo varia muito entre um bar de uma unidade e uma rede de
        franquias.
      </p>

      <h2>Quais fatores mais influenciam o preço?</h2>
      <p>Na maioria dos casos, o valor final é definido pela combinação destes fatores:</p>
      <ul>
        <li><strong>Número de unidades</strong> — mais lojas elevam o custo (às vezes com desconto por volume).</li>
        <li><strong>Quantidade de usuários</strong> — peso maior em modelos cobrados por usuário.</li>
        <li><strong>Evidência fotográfica e armazenamento</strong> — fotos geram volume de dados, que pode ter limite ou custo.</li>
        <li><strong>Multiunidade / visão consolidada</strong> — painéis de rede costumam estar em planos superiores.</li>
        <li><strong>Recursos avançados</strong> — auditoria, recebimento de mercadorias, integrações.</li>
        <li><strong>Implantação e treinamento</strong> — taxas de setup ou onboarding, quando existem.</li>
        <li><strong>Nível de suporte</strong> — canais e prazos melhores podem alterar o plano.</li>
      </ul>

      <h2>Como estimar o custo no seu restaurante</h2>
      <p>Sem inventar números, você chega a uma estimativa de raciocínio em três passos:</p>
      <ol>
        <li><strong>Identifique o modelo provável.</strong> Operação pequena, uma unidade → tende a plano por loja. Equipe grande → atenção ao por usuário. Rede/franquia → por unidade ou enterprise.</li>
        <li><strong>Liste suas variáveis:</strong> número de unidades, quantas pessoas executarão as rotinas e os recursos que você realmente precisa (evidência fotográfica, auditoria, recebimento, multiunidade).</li>
        <li><strong>Multiplique pelo modelo.</strong> Se o sistema cobra por loja e você tem uma unidade, o custo base é o valor de um plano por loja. Se cobra por usuário e você tem oito pessoas executando, é o preço unitário × oito — por isso, no "por usuário", o tamanho da equipe pesa mais que o número de lojas.</li>
      </ol>
      <p>
        Esse exercício não entrega o valor final (só o fornecedor fecha isso), mas
        mostra qual modelo é mais vantajoso para o seu caso antes de pedir
        orçamento.
      </p>

      <p>
        <em>
          Quer descobrir quanto custaria na sua operação? Com o porte e os
          recursos do seu restaurante em mãos,{" "}
          <Link href="/qualificacao">peça uma proposta sob medida</Link> — o
          número vem ajustado ao seu cenário, não a uma média de mercado.
        </em>
      </p>

      <h2>O que está incluído (e os custos ocultos)</h2>
      <p>O preço mensal raramente é o custo total. Confirme:</p>
      <ul>
        <li><strong>Implantação:</strong> há taxa de setup? Quem configura os primeiros checklists?</li>
        <li><strong>Treinamento:</strong> está incluído ou é cobrado à parte?</li>
        <li><strong>Limites:</strong> quantos usuários, checklists e execuções o plano cobre antes de subir de faixa?</li>
        <li><strong>Armazenamento de fotos:</strong> a evidência gera volume; há limite ou cobrança por armazenamento?</li>
        <li><strong>Suporte:</strong> é humano? Por qual canal? Há custo para níveis melhores?</li>
        <li><strong>Fidelidade:</strong> o contrato tem prazo mínimo? Qual a diferença entre mensal e anual?</li>
      </ul>
      <p>
        Dois sistemas com o mesmo valor de tela podem ter custo total bem
        diferente depois desses itens.
      </p>

      <h2>Perguntas para fazer ao fornecedor</h2>
      <p>Leve esta lista para a conversa — ela é sobre custo e contratação e acelera o orçamento:</p>
      <ul>
        <li>O preço é por loja, por usuário ou por unidade?</li>
        <li>Quantos usuários e checklists estão incluídos antes de subir de faixa?</li>
        <li>Há taxa de implantação ou de treinamento?</li>
        <li>Existe limite (e custo) de armazenamento para as fotos de evidência?</li>
        <li>Os recursos de que preciso já estão no plano ou são módulos pagos à parte?</li>
        <li>O suporte tem custo adicional? Há níveis pagos?</li>
        <li>Tem fidelidade? Qual a diferença de valor entre o plano mensal e o anual?</li>
        <li>Existe período de teste gratuito e por quanto tempo?</li>
      </ul>
      <p>
        Os critérios de escolha além do custo — recursos, adequação à operação,
        usabilidade — merecem uma análise à parte e não cabem aqui.
      </p>

      <h2>O que avaliar além do preço</h2>
      <p>
        Comparar só a mensalidade ignora o lado mais caro da conta: o custo de não
        ter execução no padrão. Não é sobre escolher recursos — é sobre o que a
        ausência deles custa:
      </p>
      <ul>
        <li>
          <strong>Risco sanitário</strong> — o{" "}
          <a href="https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/d/dtha/situacao-epidemiologica" target="_blank" rel="noopener noreferrer">Ministério da Saúde</a>{" "}
          registrou, em média, 662 surtos de doenças de transmissão hídrica e
          alimentar por ano (2007–2020).
        </li>
        <li>
          <strong>Multa</strong> — a{" "}
          <a href="https://www.planalto.gov.br/ccivil_03/leis/l6437.htm" target="_blank" rel="noopener noreferrer">Lei nº 6.437/1977</a>{" "}
          prevê de advertência a multa e interdição.
        </li>
        <li>
          <strong>Desperdício</strong> — a{" "}
          <a href="https://www.embrapa.br/tema-perdas-e-desperdicio-de-alimentos/sobre-o-tema" target="_blank" rel="noopener noreferrer">Embrapa</a>{" "}
          estima cerca de 94 kg per capita/ano no consumo familiar (contexto
          nacional; meça a perda no seu estoque).
        </li>
        <li><strong>Retrabalho</strong> — tarefa esquecida ou refeita é hora de equipe perdida.</li>
      </ul>
      <p>
        A pergunta útil não é "qual o mais barato", e sim "qual reduz mais perda,
        retrabalho e risco pelo valor que cobra". Para entender a diferença entre
        uma simples lista e uma camada que garante execução, veja{" "}
        <Link href="/blog/software-de-checklist-vs-execucao-operacional">
          software de checklist vs execução operacional
        </Link>{" "}
        e o guia de{" "}
        <Link href="/execucao-operacional">execução operacional para restaurantes</Link>.
      </p>

      <h2>Quanto custa o Ordem na Mesa</h2>
      <p>
        Sendo transparente: o Ordem na Mesa trabalha com proposta sob medida, não
        com um preço fixo de tabela. O motivo é prático — uma hamburgueria de uma
        unidade e uma rede com várias lojas têm necessidades e portes diferentes,
        e cobrar o mesmo valor de ambas faria uma das duas pagar por algo que não
        usa. A proposta considera o número de unidades, o tamanho da equipe e os
        recursos necessários, de forma que você não pague por excesso.
      </p>
      <p>
        Há 30 dias grátis para testar antes de qualquer decisão. Se quiser um
        valor para a sua realidade, o caminho mais rápido é montar os{" "}
        <Link href="/modelos">modelos de checklist</Link> que você usaria e{" "}
        <Link href="/qualificacao">pedir uma proposta</Link> com o seu cenário —
        assim o número vem ajustado à sua operação, não a uma média de mercado.
      </p>
    </>
  );
}
