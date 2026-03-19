import { createPageUrl } from '@/utils';

export const COMPANY_OWNER_TUTORIAL_ID = 'companyOwnerMainPortal';
export const COMPANY_OWNER_TUTORIAL_LANGUAGE = {
  ENGLISH: 'en',
  PORTUGUESE: 'pt',
};
export const COMPANY_OWNER_TUTORIAL_DISMISSED_KEY = 'companyOwnerTutorialDismissed';
export const COMPANY_OWNER_TUTORIAL_COMPLETED_KEY = 'companyOwnerTutorialCompleted';
export const DISPATCH_DRAWER_TUTORIAL_SEEN_KEY = 'dispatchDrawerTutorialSeen';
export const DISPATCH_DRAWER_TUTORIAL_COMPLETED_KEY = 'dispatchDrawerTutorialCompleted';
export const DISPATCH_DRAWER_TUTORIAL_LANGUAGE = {
  ENGLISH: 'en',
  PORTUGUESE: 'pt',
};

const COMPANY_OWNER_TUTORIAL_COMPLETION_STEPS = {
  [COMPANY_OWNER_TUTORIAL_LANGUAGE.ENGLISH]: {
    title: "You're all set",
    description: 'You can replay this tutorial anytime using the Tutorial button.',
  },
  [COMPANY_OWNER_TUTORIAL_LANGUAGE.PORTUGUESE]: {
    title: 'Está tudo pronto!',
    description: 'Pode rever este tutorial a qualquer momento através do botão “Tutorial”.',
  },
};

const DISPATCH_DRAWER_TUTORIAL_COMPLETION_STEPS = {
  [DISPATCH_DRAWER_TUTORIAL_LANGUAGE.ENGLISH]: {
    title: 'Dispatch Tutorial Complete',
    description: 'You can replay this tutorial anytime using the Tutorial button in the dispatch drawer.',
  },
  [DISPATCH_DRAWER_TUTORIAL_LANGUAGE.PORTUGUESE]: {
    title: 'Está tudo pronto!',
    description: 'Pode rever este tutorial a qualquer momento através do botão “Tutorial”.',
  },
};

export const companyOwnerTutorialSteps = {
  [COMPANY_OWNER_TUTORIAL_LANGUAGE.ENGLISH]: [
    {
      id: 'home-screen',
      page: createPageUrl('Home'),
      target: '[data-tour="home-overview"]',
      title: 'Home Page',
      description:
        'The Home Screen provides a quick snapshot of your pending actions and upcoming dispatches.',
    },
    {
      id: 'announcement-center',
      page: createPageUrl('Home'),
      target: '[data-tour="announcement-center"]',
      title: 'Home: Announcement Center',
      description:
        'This is where you will receive general communications and advisories from CCG Transit.',
    },
    {
      id: 'action-needed',
      page: createPageUrl('Home'),
      target: '[data-tour="action-needed"]',
      title: 'Home: Action Needed',
      description:
        'This section highlights dispatches that require your immediate attention, such as confirming receipt.',
      warningText: 'Items will remain in this section until you confirm receipt of your dispatch.',
    },
    {
      id: 'dispatch-preview',
      page: createPageUrl('Home'),
      target: '[data-tour="dispatch-preview"]',
      title: 'Home: Dispatch Preview',
      description: 'This area provides a quick view of your next few assigned dispatches.',
    },
    {
      id: 'dispatches-page',
      page: createPageUrl('Home'),
      target: '[data-tour="dispatches-nav"]',
      title: 'Dispatches Page',
      description: 'The Dispatches page shows your full dispatch history as well as all upcoming dispatches.',
    },
    {
      id: 'availability-page',
      page: createPageUrl('Home'),
      target: '[data-tour="availability-nav"]',
      title: 'Availability Page',
      description:
        'The Availability page allows you to indicate whether you are available for a specific shift and how many trucks you have available.',
    },
    {
      id: 'recurring-weekly-defaults',
      page: createPageUrl('Availability'),
      target: '[data-tour="recurring-weekly-defaults"]',
      tooltipPlacement: 'top',
      title: 'Availability: Weekly Defaults',
      description:
        'Here you can set your default weekly availability. These settings will automatically apply to all future weeks unless changed.',
    },
    {
      id: 'availability-controls',
      page: createPageUrl('Availability'),
      target: '[data-tour="availability-controls"]',
      title: 'Availability: Daily Controls',
      description:
        'This section allows you to actively select the number of trucks you have available for each shift.',
      warningText: 'We recommend you visit this section daily or weekly to update the amount of trucks you have available for every upcoming shift.',
    },
    {
      id: 'drivers-page',
      page: createPageUrl('Home'),
      target: '[data-tour="drivers-nav"]',
      title: 'Drivers Page',
      description:
        'Use this page to add drivers and enter their information.',
      warningText: 'Please read the instructions about the driver portal at the bottom of the page in full. Once you add a driver, you will need to request a password for them.',
    },
    {
      id: 'incidents-page',
      page: createPageUrl('Home'),
      target: '[data-tour="incidents-nav"]',
      title: 'Incidents Page',
      description: 'This is where you can create a new incident report or view your incident history.',
    },
  ],
  [COMPANY_OWNER_TUTORIAL_LANGUAGE.PORTUGUESE]: [
    {
      id: 'home-screen',
      page: createPageUrl('Home'),
      target: '[data-tour="home-overview"]',
      title: 'Página Principal / Casa',
      description: 'O ecrã principal apresenta um resumo rápido das suas ações pendentes e dos despachos futuros.',
    },
    {
      id: 'announcement-center',
      page: createPageUrl('Home'),
      target: '[data-tour="announcement-center"]',
      title: 'Casa: Centro de Anúncios',
      description: 'É aqui que irá receber comunicações gerais e avisos da CCG Transit.',
    },
    {
      id: 'action-needed',
      page: createPageUrl('Home'),
      target: '[data-tour="action-needed"]',
      title: 'Casa: Ação Necessária',
      description: 'Esta secção destaca os despachos que requerem a sua atenção imediata, como a confirmação de receção.',
      warningText: 'Os itens permanecerão nesta secção até confirmar que recebeu o despacho.',
    },
    {
      id: 'dispatch-preview',
      page: createPageUrl('Home'),
      target: '[data-tour="dispatch-preview"]',
      title: 'Casa: Pré-visualização de Despachos',
      description: 'Esta área apresenta uma visão rápida dos próximos despachos que lhe foram atribuídos.',
    },
    {
      id: 'dispatches-page',
      page: createPageUrl('Home'),
      target: '[data-tour="dispatches-nav"]',
      title: 'Página de Despachos',
      description: 'A página de Despachos apresenta o seu histórico completo de despachos, e tembem todos os despachos futuros.',
    },
    {
      id: 'availability-page',
      page: createPageUrl('Home'),
      target: '[data-tour="availability-nav"]',
      title: 'Página de Disponibilidade',
      description: 'A página de Disponibilidade permite-lhe indicar se está disponível para um turno específico e quantos camiões tem disponíveis.',
    },
    {
      id: 'recurring-weekly-defaults',
      page: createPageUrl('Availability'),
      target: '[data-tour="recurring-weekly-defaults"]',
      tooltipPlacement: 'top',
      title: 'Disponibilidade: Padrões Semanais',
      description: 'Aqui pode definir a sua disponibilidade semanal por defeito. Estas definições serão aplicadas automaticamente a todas as semanas futuras, salvo se forem alteradas.',
    },
    {
      id: 'availability-controls',
      page: createPageUrl('Availability'),
      target: '[data-tour="availability-controls"]',
      title: 'Disponibilidade: Controlo Diário',
      description: 'Esta secção permite-lhe selecionar ativamente o número de camiões que tem disponíveis para cada turno.',
      warningText: 'Recomendamos que visite esta secção diariamente ou semanalmente para atualizar a quantidade de camiões disponíveis para cada turno futuro.',
    },
    {
      id: 'drivers-page',
      page: createPageUrl('Home'),
      target: '[data-tour="drivers-nav"]',
      title: 'Página de Motoristas',
      description: 'Utilize esta página para adicionar motoristas e inserir as suas informações.',
      warningText: 'Por favor, leia as instruções sobre o portal dos motoristas no final da página na íntegra. Depois de adicionar um motorista, será necessário solicitar uma palavra-passe para ele.',
    },
    {
      id: 'incidents-page',
      page: createPageUrl('Home'),
      target: '[data-tour="incidents-nav"]',
      title: 'Página de Incidentes',
      description: 'Aqui pode criar um novo relatório de incidente ou consultar o seu histórico de incidentes.',
    },
  ],
};

export const dispatchDrawerTutorialSteps = {
  [DISPATCH_DRAWER_TUTORIAL_LANGUAGE.ENGLISH]: [
    {
      id: 'report-incident',
      target: '[data-tour="dispatch-report-incident"]',
      title: 'Report Incident',
      description:
        'Click here to report breakdowns, accidents, delays, or any other incident related to this dispatch.',
      warningText: 'This should be done after informing the dispatcher of your incident and is for record-keeping purposes. We encourage you to create reports immediately and visit the Incidents page to record your updates as you resolve the incident.',
    },
    {
      id: 'screenshot-dispatch',
      target: '[data-tour="dispatch-screenshot"]',
      title: 'Screenshot Dispatch',
      description:
        'Click here to take a clean screenshot of your dispatch without the any of the action buttons or editable sections.',
    },
    {
      id: 'edit-trucks',
      target: '[data-tour="dispatch-edit-trucks"]',
      title: 'Edit Trucks',
      description: 'Click here to edit the truck numbers assigned to this dispatch.',
    },
    {
      id: 'assignment-details',
      target: '[data-tour="dispatch-assignment-details"]',
      title: 'Assignment Details',
      description: 'This section shows the standard details and instructions of the assignment.',
    },
    {
      id: 'dispatch-notes',
      target: '[data-tour="dispatch-notes"]',
      title: 'Dispatch Notes',
      description: 'These are dispatch notes and reminders that are included every dispatch.',
    },
    {
      id: 'confirm-receipt',
      target: '[data-tour="dispatch-confirm-receipt"]',
      title: 'Confirm Receipt',
      description:
        'Click here to confirm receipt of the dispatch.',
      warningText: 'You must confirm any time you receive: a new dispatch, a new schedule, an amendment, a cancellation, or another important update.',
    },
    {
      id: 'driver-assignments',
      target: '[data-tour="dispatch-driver-assignments"]',
      title: 'Driver Assignments',
      description: 'After confirming receipt, use this dropdown menu to assign drivers to your dispatch.',
      warningText: 'Please familiarize yourself with the instructions on the Drivers page before using this feature.',
    },
    {
      id: 'time-log',
      target: '[data-tour="dispatch-time-log"]',
      tooltipPlacement: 'top',
      title: 'Time Log',
      description:
        'This is where you enter the check-in and check-out times for yourself or your drivers. The time log is for informational purposes only.',
    },
  ],
  [DISPATCH_DRAWER_TUTORIAL_LANGUAGE.PORTUGUESE]: [
    {
      id: 'report-incident',
      target: '[data-tour="dispatch-report-incident"]',
      title: 'Reportar Incidente',
      description: 'Clique aqui para reportar avarias, acidentes, atrasos ou qualquer outro incidente relacionado com este despacho.',
      warningText: 'Isto deve ser feito após informar o despachante sobre o incidente e é para fins de registo. Encorajamos que crie os relatórios imediatamente e visite a página de Incidentes para registar as suas atualizações à medida que resolve o incidente.',
    },
    {
      id: 'screenshot-dispatch',
      target: '[data-tour="dispatch-screenshot"]',
      title: 'Capturar o Despacho',
      description: 'Clique aqui para tirar uma captura de ecrã limpa do seu despacho, sem qualquer um dos botões de ação ou secções editáveis.',
    },
    {
      id: 'edit-trucks',
      target: '[data-tour="dispatch-edit-trucks"]',
      title: 'Editar Camiões',
      description: 'Clique aqui para editar os números dos camiões atribuídos a este despacho.',
    },
    {
      id: 'assignment-details',
      target: '[data-tour="dispatch-assignment-details"]',
      title: 'Detalhes da Atribuição',
      description: 'Esta secção apresenta os detalhes e instruções padrão da atribuição.',
    },
    {
      id: 'dispatch-notes',
      target: '[data-tour="dispatch-notes"]',
      title: 'Notas do Despacho',
      description: 'Estas são notas e lembretes incluídos em todos os despachos.',
    },
    {
      id: 'confirm-receipt',
      target: '[data-tour="dispatch-confirm-receipt"]',
      title: 'Confirmar Receção',
      description: 'Clique aqui para confirmar que recebeu o despacho.',
      warningText: 'Deve confirmar sempre que receber: um novo despacho, um novo horário, uma alteração, um cancelamento ou outra atualização importante.',
    },
    {
      id: 'driver-assignments',
      target: '[data-tour="dispatch-driver-assignments"]',
      title: 'Atribuições de Motoristas',
      description: 'Depois de confirmar a receção, utilize este menu suspenso para atribuir motoristas ao seu despacho.',
      warningText: 'Por favor, familiarize-se com as instruções na página de Motoristas antes de usar esta funcionalidade.',
    },
    {
      id: 'time-log',
      target: '[data-tour="dispatch-time-log"]',
      tooltipPlacement: 'top',
      title: 'Registo de Horas',
      description: 'Aqui pode inserir as horas de entrada e saída, suas ou dos seus motoristas. O registo de horas é apenas para fins informativos.',
    },
  ],
};

export const tutorialRegistry = {
  [COMPANY_OWNER_TUTORIAL_ID]: {
    stepsByLanguage: companyOwnerTutorialSteps,
    completionStepsByLanguage: COMPANY_OWNER_TUTORIAL_COMPLETION_STEPS,
    defaultLanguage: COMPANY_OWNER_TUTORIAL_LANGUAGE.ENGLISH,
    storageKeys: {
      dismissed: COMPANY_OWNER_TUTORIAL_DISMISSED_KEY,
      completed: COMPANY_OWNER_TUTORIAL_COMPLETED_KEY,
    },
  },
  dispatchDrawer: {
    stepsByLanguage: dispatchDrawerTutorialSteps,
    completionStepsByLanguage: DISPATCH_DRAWER_TUTORIAL_COMPLETION_STEPS,
    defaultLanguage: DISPATCH_DRAWER_TUTORIAL_LANGUAGE.ENGLISH,
    storageKeys: {
      seen: DISPATCH_DRAWER_TUTORIAL_SEEN_KEY,
      completed: DISPATCH_DRAWER_TUTORIAL_COMPLETED_KEY,
    },
  },
};
