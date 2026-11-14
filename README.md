# Portal do Hostel

Portal único com login e acesso por papel, juntando os apps **Rotatividade (camareira)**, **Lavanderia (Lsr)**, **Reservas (Hostel)** e **Gestão de custos**.
Os dados ficam na nuvem (Supabase, plano gratuito) e a segurança é feita pelo banco (RLS), não pela tela.

| Papel | Vê |
|---|---|
| `admin` | Tudo + tela de usuários |
| `lavanderia` | Só Lavanderia |
| `camareira` | Só Rotatividade |
| `pendente` | Nada (usuário novo, aguardando liberação) |

## Colocar no ar (uma vez só)

1. **Supabase**: crie conta em supabase.com e um projeto novo (região São Paulo, anote a senha do banco).
2. **Banco**: no projeto, abra *SQL Editor → New query*, cole todo o `supabase/schema.sql` e clique *Run*.
3. **Fechar cadastro aberto**: *Authentication → Sign In / Providers → Email* → desligue **Allow new users to sign up** (só você cria usuários).
4. **Seu usuário**: *Authentication → Users → Add user* (seu e-mail + senha, marque *Auto Confirm User*). Depois, no SQL Editor:
   `update public.profiles set role = 'admin' where email = 'SEU_EMAIL';`
5. **Chaves**: *Project Settings → API*. Copie a **Project URL** e a chave **anon/public** para o `config.js`. Nunca use a `service_role`.
6. **Publicar**: *Settings → Pages → Deploy from a branch → main / (root)*. O portal abre na URL mostrada.
7. **Pessoas novas**: cada pessoa abre o portal, clica em **Criar conta** e entra como `pendente` (sem ver nada). Você libera em *Usuários e acessos*, escolhendo o papel. (Também dá para criar em *Authentication → Users → Add user*.)

## Fechar o cadastro depois que todos entraram

1. Supabase → *Authentication → Sign In / Providers → User Signups* → desligue **Allow new users to sign up** → *Save changes*. É isto que realmente fecha o cadastro.
2. No `config.js`, troque `ALLOW_SIGNUP: true` por `false` para esconder o botão “Criar conta”.

Para cadastrar alguém depois, ligue de novo ou crie a pessoa em *Authentication → Users*.

## Trazer os dados atuais

Cada app antigo tem **Backup JSON**. Abra o app antigo, exporte o backup, abra o módulo equivalente no portal e use **Importar/Restaurar backup**. Ao importar, os dados já vão para a nuvem.

## Observações

- Dois aparelhos editando o mesmo módulo ao mesmo tempo: vale a última gravação. Recarregue ao abrir o módulo para ver o que os outros fizeram.
- Plano gratuito do Supabase: pausa o projeto após 1 semana sem uso e não faz backup automático. Exporte backups JSON de vez em quando.
- Os apps antigos (repositórios originais) não foram alterados.

## Backup e importação

- **Backup geral** (só admin): tile no menu; baixa um JSON com todos os módulos. Faça de vez em quando — o plano gratuito do Supabase não tem backup automático.
- **Importar / apagar tudo**: ficam visíveis só para o admin enquanto `ALLOW_IMPORT: true` em `config.js`. Depois da primeira carga, mude para `false` e os botões somem para todos.
- Os arquivos levam `?v=N` no `index.html`; ao mudar CSS/JS, aumente o número para o celular não usar cache antigo.
