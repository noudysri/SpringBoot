package com.smockin.mockserver.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.Date;

@Data
@AllArgsConstructor
public class MailServerMessageInboxDTO {

    private String cacheID;
    private String from;
    private String subject;
    private String body;
    private Date dateReceived;
    private int attachmentsCount;

}
