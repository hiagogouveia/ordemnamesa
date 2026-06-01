import Link from "next/link";

export default function Body() {
  return (
    <>
      <p>
        "Quem ficou de conferir o estoque?" "Achei que era você." Essa conversa
        acontece todo dia em restaurantes que controlam tarefas no grito, no
        grupo de WhatsApp ou no papel. O resultado é retrabalho, tarefa
        esquecida e equipe estressada. Controlar tarefas operacionais com método
        — do papel ao digital — é o que separa a operação que improvisa da que
        roda no padrão.
      </p>

      <h2>Os três modos de controlar tarefas (e por que dois falham)</h2>
      <h3>1. Na memória e no grito</h3>
      <p>
        Funciona com 3 pessoas e some quando a operação cresce. Depende do gestor
        estar presente o tempo todo cobrando. É o modo mais caro que existe —
        custa a sua atenção integral.
      </p>
      <h3>2. No papel e no WhatsApp</h3>
      <p>
        Melhora a comunicação, mas não tem responsável claro nem evidência. A
        mensagem se perde no meio de 200 outras, e ninguém consegue auditar o
        que foi feito de verdade. Veja por que{" "}
        <Link href="/comparativos/ordem-na-mesa-vs-whatsapp">
          WhatsApp não é ferramenta de checklist
        </Link>
        .
      </p>
      <h3>3. No checklist digital com responsável e ordem</h3>
      <p>
        Cada tarefa tem dono, prazo, ordem e — quando crítica — exige foto. O
        funcionário sabe exatamente o que fazer ao começar o turno, e o gestor vê
        o progresso sem precisar perguntar.
      </p>

      <h2>O que um bom controle de tarefas resolve</h2>
      <ul>
        <li>
          <strong>Comunicação entre turnos:</strong> o que o turno da manhã
          deixou pendente aparece para o turno da noite, sem ruído.
        </li>
        <li>
          <strong>Responsabilização:</strong> cada tarefa tem um nome. Acabou o
          "achei que era você".
        </li>
        <li>
          <strong>Redução de retrabalho:</strong> tarefa feita certa na primeira
          vez não precisa ser refeita.
        </li>
        <li>
          <strong>Visibilidade gerencial:</strong> o dono enxerga a operação de
          longe, pelo celular, e só intervém quando algo realmente trava.
        </li>
      </ul>

      <h2>Tarefa por turno, não por dia</h2>
      <p>
        Um erro comum é tratar tarefas como uma lista única do dia. A operação
        real é organizada por <strong>turno</strong>: abertura, troca de turno e
        fechamento têm rotinas diferentes. Por isso vale separar o{" "}
        <Link href="/modelos/checklist-troca-turno-restaurante">
          checklist de troca de turno
        </Link>{" "}
        do{" "}
        <Link href="/modelos/checklist-abertura-pizzaria">
          checklist de abertura
        </Link>{" "}
        e do fechamento.
      </p>

      <h2>Do papel ao digital sem trauma</h2>
      <p>
        A migração não precisa ser dolorosa. Pegue o checklist de papel que você
        já usa, transforme cada item em uma tarefa digital, defina o responsável
        e marque o que é crítico. Em menos de uma hora a primeira rotina está no
        ar — e o restaurante começa a operar com{" "}
        <Link href="/execucao-operacional">execução operacional de verdade</Link>
        .
      </p>
    </>
  );
}
