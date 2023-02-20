package com.smockin.mockserver.engine;

import com.icegreen.greenmail.imap.ImapHostManager;
import com.icegreen.greenmail.imap.commands.IdRange;
import com.icegreen.greenmail.store.FolderException;
import com.icegreen.greenmail.store.FolderListener;
import com.icegreen.greenmail.store.MailFolder;
import com.icegreen.greenmail.store.StoredMessage;
import com.icegreen.greenmail.user.GreenMailUser;
import com.icegreen.greenmail.user.UserException;
import com.icegreen.greenmail.user.UserManager;
import com.icegreen.greenmail.util.GreenMail;
import com.icegreen.greenmail.util.ServerSetup;
import com.smockin.admin.exception.RecordNotFoundException;
import com.smockin.admin.persistence.dao.MailMockDAO;
import com.smockin.admin.persistence.entity.MailMock;
import com.smockin.admin.persistence.entity.SmockinUser;
import com.smockin.admin.persistence.enums.RecordStatusEnum;
import com.smockin.admin.service.MailMockMessageService;
import com.smockin.admin.service.SmockinUserService;
import com.smockin.mockserver.dto.*;
import com.smockin.mockserver.exception.MockServerException;
import com.smockin.utils.GeneralUtils;
import org.apache.commons.io.IOUtils;
import org.apache.commons.lang3.BooleanUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.commons.mail.util.MimeMessageParser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.mail.*;
import javax.mail.internet.MimeBodyPart;
import javax.mail.internet.MimeMessage;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
@Transactional
public class MockedMailServerEngine {

    private final Logger logger = LoggerFactory.getLogger(MockedMailServerEngine.class);

    private String host = "0.0.0.0";
    private String defaultMailUserPassword = "letmein";
    private static final String MULTIPART = "multipart";

    private GreenMail greenMail;
    private ImapHostManager imapHostManager;
    private final Object serverStateMonitor = new Object();
    private MockServerState serverState = new MockServerState(false, 0);
    private final ConcurrentHashMap<String, SmockinGreenMailUserWrapper> mailUsersMap = new ConcurrentHashMap<>(0);

    @Autowired
    private MailMockMessageService mailMockMessageService;

    @Autowired
    private MailInboxCache mailInboxCache;

    @Autowired
    private SmockinUserService smockinUserService;

    @Autowired
    private MailMockDAO mailMockDAO;


    public void start(final MockedServerConfigDTO configDTO,
                      final List<MailMock> mailInboxes) throws MockServerException {
        logger.debug("started called");

        synchronized (serverStateMonitor) {

            try {

                mailInboxCache.clearAll();

                final ServerSetup mailServerSetup = new ServerSetup(configDTO.getPort(), host, ServerSetup.PROTOCOL_SMTP);
                greenMail = new GreenMail(mailServerSetup);

                // Custom message delivery handler stops auto user creation
                applyMessageDeliveryHandler(greenMail,
                        BooleanUtils.toBoolean(configDTO.getNativeProperties().get(GeneralUtils.AUTO_GEN_INBOXES_PARAM)));

                imapHostManager = greenMail.getManagers().getImapHostManager();

                createAllMailUsers(mailInboxes);

                greenMail.start();

                serverState.setRunning(true);
                serverState.setPort(configDTO.getPort());

            } catch (Exception e) {
                throw new MockServerException("Error starting mail mock engine", e);
            }

        }

    }

    public MockServerState getCurrentState() throws MockServerException {
        synchronized (serverStateMonitor) {
            return serverState;
        }
    }

    public void shutdown() throws MockServerException {
        logger.debug("shutdown called");

        if (greenMail == null) {
            return;
        }

        try {

            synchronized (serverStateMonitor) {
                greenMail.stop();
                serverState.setRunning(false);
            }

            mailInboxCache.clearAll();

        } catch (Exception e) {
            throw new MockServerException("Error shutting down mail mock engine", e);
        }

    }

    void applyMessageDeliveryHandler(final GreenMail greenMail,
                                     final boolean autoGenerateInboxes) {

        final UserManager userManager = greenMail.getUserManager();

        // Greenmail automatically creates a user for any email address received.
        // This overrides this behavior and returns an exception instead.
        userManager.setMessageDeliveryHandler((msg, mailAddress) -> {

            final GreenMailUser user = userManager.getUserByEmail(mailAddress.getEmail());
            final SmockinGreenMailUserWrapper smockinGreenMailUserWrapper = mailUsersMap.get(mailAddress.getEmail());

            if (user != null
                    && smockinGreenMailUserWrapper != null
                    && !smockinGreenMailUserWrapper.isDisabled()) {
                return user;
            }

            if (autoGenerateInboxes) {
                return autoGenerateMailInbox(mailAddress.getEmail());
            }

            throw new UserException(String.format("Inbox %s not found on mail server", mailAddress.getEmail()));
        });

    }

    GreenMailUser autoGenerateMailInbox(final String email) throws UserException {
        logger.debug(String.format("Auto generating inbox for email: %s", email));

        try {

            final MailMock existingMailMock = mailMockDAO.findByAddress(email);

            if (existingMailMock != null) {
                throw new UserException(
                        String.format("Inbox '%s' already exists. Likely created by another user or disabled. It currently has a status of '%s'",
                            email,
                            existingMailMock.getStatus()));
            }

            final Optional<SmockinUser> adminUserOpt = smockinUserService.loadDefaultUser();

            if (!adminUserOpt.isPresent()) {
                throw new UserException(String.format("An error occurred during the auto inbox generation of email %s. Default sMockin user could not be found!", email));
            }

            final MailMock mailMock = new MailMock(email, RecordStatusEnum.ACTIVE, adminUserOpt.get(), true);

            return addMailUser(mailMockDAO.save(mailMock));

        } catch (Exception e) {
            throw new UserException(String.format("An error occurred during the auto inbox generation of email %s", email), e);
        }

    }

    void createAllMailUsers(final List<MailMock> mailAddresses) throws MessagingException, FolderException {
        logger.debug("createMailUsers called");

        mailUsersMap.clear();

        if (mailAddresses == null) {
            return;
        }

        for (final MailMock mailMock : mailAddresses) {
            addMailUser(mailMock);
        }

    }

    public GreenMailUser addMailUser(final MailMock mailMock) throws FolderException {
        logger.debug("addMailUser called");

        final GreenMailUser user =
                greenMail.setUser(mailMock.getAddress(), mailMock.getAddress(), defaultMailUserPassword);

        final FolderListener folderListener =
                (mailMock.isSaveReceivedMail())
                    ? applySaveMailListener(user, mailMock) // Use DB for storing messages
                    : applyCacheMailListener(user, mailMock); // Use Cache for storing messages

        mailUsersMap.putIfAbsent(mailMock.getAddress(), new SmockinGreenMailUserWrapper(user, folderListener, false));

        return user;
    }

    public void enableMailUser(final MailMock mailMock) throws FolderException {
        logger.debug("enableMailUser called");

        final SmockinGreenMailUserWrapper user = mailUsersMap.get(mailMock.getAddress());

        if (user == null) {
            addMailUser(mailMock);
            return;
        }

        user.setDisabled(false);
    }

    public void suspendMailUser(final MailMock mailMock) {
        logger.debug("suspendMailUser called");

        final SmockinGreenMailUserWrapper user = findGreenMailUser(mailMock.getAddress());

        user.setDisabled(true);

        purgeAllMailServerInboxMessages(mailMock.getExtId());
    }

    public void removeMailUser(final MailMock mailMock) {
        logger.debug("removeMailUser called");

        final SmockinGreenMailUserWrapper user = mailUsersMap.get(mailMock.getAddress());

        if (user == null) {
            return;
        }

        user.getUser().delete();

        mailUsersMap.remove(mailMock.getAddress());
        purgeAllMailServerInboxMessages(mailMock.getExtId());
    }

    public void addListenerForMailUser(final MailMock mailMock) {
        logger.debug("addListenerForMailUser called");

        final SmockinGreenMailUserWrapper user = findGreenMailUser(mailMock.getAddress());

        try {
            if (mailMock.isSaveReceivedMail()) {
                // Use DB for storing messages
                user.setListener(applySaveMailListener(user.getUser(), mailMock));
            } else {
                // Use Cache for storing messages
                user.setListener(applyCacheMailListener(user.getUser(), mailMock));
            }

        } catch (Exception e) {
            logger.error("Error adding listener for user: " + mailMock.getAddress(), e);
        }

    }

    public void removeListenerForMailUser(final MailMock mailMock) {
        logger.debug("removeListenerForMailUser called");

        final SmockinGreenMailUserWrapper user = findGreenMailUser(mailMock.getAddress());

        try {

            if (user.getListener() != null) {
                imapHostManager.getInbox(user.getUser()).removeListener(user.getListener());
                user.setListener(null);
            }

        } catch (Exception e) {
            logger.error("Error removing listener for user: " + mailMock.getAddress(), e);
        }

    }

    FolderListener applySaveMailListener(final GreenMailUser user,
                                         final MailMock mailMock) throws FolderException {
        logger.debug("applySaveMailListener called");

        // Note, we cannot pass the MailMock entity into this listener as there will be not be a
        // transaction available at the time this executes, so will pass in the externalId.
        final String mailMockExtId = mailMock.getExtId();

        FolderListener folderListener;

        imapHostManager.getInbox(user)
                .addListener(folderListener = new FolderListener() {

            public void added(final int i) {

                try {

                    final MailFolder inbox = imapHostManager.getInbox(user);
                    final StoredMessage storedMessage = inbox.getMessage(i);
                    final MimeMessage message = storedMessage.getMimeMessage();

                    final String externalId = mailMockMessageService.saveMailMessage(
                            mailMockExtId,
                            extractMailSender(message),
                            message.getSubject(),
                            extractMailBodyContent(message),
                            message.getReceivedDate(),
                            Optional.empty());

                    extractAndSaveAllAttachments(externalId, message);

                    inbox.expunge(new IdRange[] { new IdRange(i) });

                } catch (Exception e) {
                    logger.error("Error saving received mail message to DB", e);
                }

            }

            public void mailboxDeleted() {}
            public void expunged(final int i) {}
            public void flagsUpdated(final int i, final Flags flags, final Long aLong) {}

        });

        return folderListener;
    }

    FolderListener applyCacheMailListener(final GreenMailUser user,
                                          final MailMock mailMock) throws FolderException {
        logger.debug("applyCacheMailListener called");

        // Note, we cannot pass the MailMock entity into this listener as there will be not be a
        // transaction available at the time this executes, so will pass in the externalId.
        final String mailMockExtId = mailMock.getExtId();

        FolderListener folderListener;

        imapHostManager.getInbox(user)
                .addListener(folderListener = new FolderListener() {

                    public void added(final int i) {

                        try {

                            final MailFolder inbox = imapHostManager.getInbox(user);
                            final StoredMessage storedMessage = inbox.getMessage(i);
                            final MimeMessage message = storedMessage.getMimeMessage();

                            final List<MailServerMessageInboxAttachmentDTO> attachments = extractAllMessageAttachments(message);

                            final MailServerMessageInboxDTO mailServerMessageInboxDTO
                                    = new MailServerMessageInboxDTO(
                                            GeneralUtils.generateUUID(),
                                            extractMailSender(message),
                                            message.getSubject(),
                                            extractMailBodyContent(message),
                                            message.getReceivedDate(),
                                            attachments.size());

                            mailInboxCache.add(
                                    mailMockExtId,
                                    new CachedMailServerMessage(mailServerMessageInboxDTO, attachments));

                            inbox.expunge(new IdRange[] { new IdRange(i) });

                        } catch (Exception e) {
                            logger.error("Error adding received mail message to mail cache", e);
                        }

                    }

                    public void mailboxDeleted() {}
                    public void expunged(final int i) {}
                    public void flagsUpdated(final int i, final Flags flags, final Long aLong) {}

                });

        return folderListener;
    }

    public List<MailServerMessageInboxDTO> getMessagesFromMailServerInbox(final String mailMockExtId,
                                                                          final Optional<MailMessageSearchDTO> mailMessageSearchDTO,
                                                                          final Optional<Integer> pageStart) throws MockServerException {
        logger.debug("getAllEmailsForAddress called");

        return mailInboxCache.findAllMessages(mailMockExtId, mailMessageSearchDTO, pageStart)
                .stream()
                .map(c ->
                        c.getMailServerMessageInboxDTO())
                .collect(Collectors.toList());
    }

    public long getMessageCountFromMailServerInbox(final String mailMockExtId, final Optional<MailMessageSearchDTO> mailMessageSearchDTO) throws MockServerException {
        logger.debug("getMessageCountFromMailServerInbox called");

        return mailInboxCache.countAllMessages(mailMockExtId, mailMessageSearchDTO);
    }

    public List<MailServerMessageInboxAttachmentDTO> getMessageAttachmentsFromMailServerInbox(final String mailMockExtId,
                                                                                              final String messageId) throws MockServerException {
        logger.debug("getMessageAttachmentsFromMailServerInbox called");

        final Optional<CachedMailServerMessage> cachedMailServerMessageOpt = mailInboxCache.findMessageById(mailMockExtId, messageId);

        if (!cachedMailServerMessageOpt.isPresent()) {
            throw new MockServerException(String.format("Error locating inbox for mailMockExtId '%s'", mailMockExtId));
        }

        return cachedMailServerMessageOpt.get().getAttachments();
    }

    public boolean purgeSingleMessageFromMailServerInbox(final String mailMockExtId,
                                                         final String messageId) throws MockServerException {
        logger.debug("purgeSingleMessageFromMailServerInbox called");

        mailInboxCache.delete(mailMockExtId, messageId);

        return true;
    }

    public void purgeAllMailServerInboxMessages(final String mailMockExtId) throws MockServerException {
        logger.debug("purgeAllMailServerInboxMessages called");

        mailInboxCache.deleteAll(mailMockExtId);
    }

    public void purgeAllMailMessagesForAllInboxes() throws MockServerException {
        logger.debug("purgeAllMailMessagesForAllInboxes called");

        mailInboxCache.clearAll();
    }

    String extractMailSender(final MimeMessage message) throws MessagingException {

        if (message.getSender() != null) {
            return message.getSender().toString();
        }

        final Address[] fromAddresses = message.getFrom();

        if (fromAddresses != null && fromAddresses.length != 0) {
            return fromAddresses[0].toString();
        }

        throw new MessagingException("Unable to determine mail sender");
    }

    SmockinGreenMailUserWrapper findGreenMailUser(final String address) {

        final SmockinGreenMailUserWrapper user = mailUsersMap.get(address);

        if (user == null) {
            throw new RecordNotFoundException();
        }

        return user;
    }

    List<MailServerMessageInboxAttachmentDTO> extractAllMessageAttachments(final MimeMessage mimeMessage) throws MockServerException {

        try {

            final List<MailServerMessageInboxAttachmentDTO> attachmentDTOs = new ArrayList<>();

            if (!mimeMessage.getContentType().contains(MULTIPART)
                    || !(mimeMessage.getContent() instanceof Multipart)) {
                return attachmentDTOs;
            }

            final Multipart multipart = (Multipart) mimeMessage.getContent();

            for (int i=0; i < multipart.getCount(); i++) {

                if (multipart.getBodyPart(i) instanceof MimeBodyPart) {

                    final MimeBodyPart mimeBodyPart = (MimeBodyPart)multipart.getBodyPart(i);

                    if (Part.ATTACHMENT.equalsIgnoreCase(mimeBodyPart.getDisposition())) {

                        attachmentDTOs.add(new MailServerMessageInboxAttachmentDTO(
                                Optional.empty(),
                                mimeBodyPart.getFileName(),
                                sanitizeContentType(mimeBodyPart.getContentType()),
                                GeneralUtils.base64Encode(IOUtils.toByteArray(mimeBodyPart.getInputStream()))));
                    }

                }

            }

            return attachmentDTOs;

        } catch (Exception e) {
            throw new MockServerException("Error extracting attachment(s) from mail message", e);
        }

    }

    String extractMailBodyContent(final MimeMessage message) throws Exception {

        final String content = extractHtmlContent(message);

        if (content != null) {
            return content;
        }

        return extractPlainContent(message);
    }

    String extractHtmlContent(final MimeMessage message) throws Exception {
        return new MimeMessageParser(message).parse().getHtmlContent();
    }

    String extractPlainContent(final MimeMessage message) throws Exception {
        return new MimeMessageParser(message).parse().getPlainContent();
    }

    void extractAndSaveAllAttachments(final String messageExternalId,
                                      final MimeMessage mimeMessage) {

        extractAllMessageAttachments(mimeMessage)
                .stream()
                .forEach(a ->
                        mailMockMessageService.saveMailMessageAttachment(
                            messageExternalId,
                            a.getName(),
                            a.getMimeType(),
                            a.getBase64Content()));

    }

    String sanitizeContentType(final String contentType) {
        return StringUtils.substringBefore(contentType, ";");
    }

}
