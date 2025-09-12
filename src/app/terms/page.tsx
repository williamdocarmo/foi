// src/app/terms/page.tsx
import { siteConfig } from "@/config/site";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsOfServicePage() {
  const today = new Date().toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="container mx-auto max-w-4xl py-8 md:py-12">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-3xl">Termos de Uso</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-lg max-w-none dark:prose-invert">
          <p>Última atualização: {today}</p>
          
          <h2>1. Aceitação dos Termos</h2>
          <p>
            Ao criar uma conta e usar o aplicativo "Você Sabia?" (doravante "Aplicativo"), você concorda em cumprir e estar sujeito a estes Termos de Uso. Se você não concordar com estes termos, não deverá criar uma conta ou usar os serviços de sincronização.
          </p>

          <h2>2. Descrição do Serviço</h2>
          <p>
            O Aplicativo oferece uma experiência de aprendizado gamificada. Os usuários podem usar o aplicativo como "convidado", com todo o progresso salvo localmente no navegador, sem a necessidade de fornecer dados pessoais. Opcionalmente, os usuários podem criar uma conta para sincronizar seu progresso de jogo (curiosidades lidas, pontuações, etc.) através do Firebase, permitindo o acesso em múltiplos dispositivos.
          </p>

          <h2>3. Coleta e Uso de Dados</h2>
          <p>
            Ao criar uma conta, você concorda em fornecer um endereço de e-mail ou usar sua conta do Google. Os seguintes dados relacionados ao jogo serão associados à sua conta e armazenados de forma segura no Firebase:
          </p>
          <ul>
            <li>Estatísticas de jogo (total de curiosidades lidas, sequências, pontuações de quiz).</li>
            <li>Identificadores de curiosidades lidas.</li>
            <li>Seu nome de exibição e foto do perfil (se fornecido pelo Google ou e-mail) para a funcionalidade de Ranking.</li>
          </ul>
          <p>
            Esses dados são usados exclusivamente para fornecer a funcionalidade principal do Aplicativo, como sincronização de progresso e exibição no ranking de jogadores. Não compartilhamos seus dados com terceiros.
          </p>

          <h2>4. Responsabilidades do Usuário</h2>
          <p>
            Você é responsável por manter a confidencialidade da sua senha e conta. Você concorda em não usar o Aplicativo para fins ilegais ou não autorizados.
          </p>
          
          <h2>5. Modificações nos Termos</h2>
          <p>
            Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificaremos sobre alterações significativas. O uso contínuo do serviço após tais alterações constituirá seu consentimento para com as mudanças.
          </p>

          <h2>6. Encerramento</h2>
          <p>
            Podemos suspender ou encerrar seu acesso ao serviço de sincronização a qualquer momento, sem aviso prévio, por qualquer motivo, incluindo violação destes Termos.
          </p>
          
        </CardContent>
      </Card>
    </div>
  );
}
